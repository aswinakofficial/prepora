// Keeps issue cards on the "Prepora roadmap" board in the column their state calls for. Used by
// the project-status, claim and stale-claims workflows through actions/github-script.
//
// The board belongs to a user account, which the workflows' built-in GITHUB_TOKEN can't write to,
// so this uses a PROJECT_TOKEN secret (a token with project access — see CONTRIBUTING.md →
// "Maintainers: board automation"). Without it, every call is a logged no-op: claiming and the
// other workflows keep working, only the board isn't updated.
//
// Column rules, derived from the issue's current state (so running it twice is harmless):
//   closed                                   → Done
//   an open, non-draft PR that closes it     → In review
//   an open draft PR, or anyone assigned     → In progress
//   nothing in flight                        → back to Ready, but only if the card had moved
//                                              forward; Backlog cards (epics, maintainer-only,
//                                              blocked) stay in Backlog
// An issue not yet on the board is added: Backlog for epics, maintainer-only and blocked issues,
// Ready otherwise.

const PROJECT_OWNER = "aswinakofficial";
const PROJECT_NUMBER = 1;
const FORWARD = new Set(["In progress", "In review", "Done"]);
const BACKLOG_LABELS = new Set([
  "epic",
  "status: maintainer",
  "status: blocked",
  "status: needs design",
]);

const ISSUE_QUERY = `
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        id
        state
        assignees { totalCount }
        labels(first: 50) { nodes { name } }
        closedByPullRequestsReferences(first: 20, includeClosedPrs: false) {
          nodes { state isDraft }
        }
        projectItems(first: 20) {
          nodes {
            id
            project { id }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }`;

function projectClient(getOctokit, core) {
  const token = process.env.PROJECT_TOKEN;
  if (!token) {
    core.notice("PROJECT_TOKEN is not set, so the project board wasn't updated.");
    return null;
  }
  return getOctokit(token);
}

async function loadProject(gh) {
  const { user } = await gh.graphql(
    `query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          field(name: "Status") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
  );
  const project = user.projectV2;
  return {
    id: project.id,
    fieldId: project.field.id,
    optionId: Object.fromEntries(project.field.options.map((o) => [o.name, o.id])),
  };
}

function targetStatus(issue, current) {
  if (issue.state === "CLOSED") return "Done";
  const openPrs = issue.closedByPullRequestsReferences.nodes.filter((pr) => pr.state === "OPEN");
  if (openPrs.some((pr) => !pr.isDraft)) return "In review";
  if (openPrs.length > 0 || issue.assignees.totalCount > 0) return "In progress";
  if (current === null) {
    const labels = issue.labels.nodes.map((l) => l.name);
    return labels.some((l) => BACKLOG_LABELS.has(l)) ? "Backlog" : "Ready";
  }
  return FORWARD.has(current) ? "Ready" : current;
}

async function syncIssue({ getOctokit, core, owner, repo, number }) {
  const gh = projectClient(getOctokit, core);
  if (!gh) return;
  const project = await loadProject(gh);
  const { repository } = await gh.graphql(ISSUE_QUERY, { owner, repo, number });
  const issue = repository.issue;
  if (!issue) return; // a pull request number, or deleted

  let item = issue.projectItems.nodes.find((i) => i.project.id === project.id);
  const current = item?.fieldValueByName?.name ?? null;
  const target = targetStatus(issue, current);
  if (target === current) {
    core.info(`#${number}: already in ${current}`);
    return;
  }
  if (!item) {
    const added = await gh.graphql(
      `mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
      }`,
      { project: project.id, content: issue.id },
    );
    item = added.addProjectV2ItemById.item;
  }
  await gh.graphql(
    `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) { projectV2Item { id } }
    }`,
    {
      project: project.id,
      item: item.id,
      field: project.fieldId,
      option: project.optionId[target],
    },
  );
  core.info(`#${number}: ${current ?? "not on the board"} → ${target}`);
}

// Every issue a pull request will close ("Closes #12" in its description, or linked in the sidebar).
async function syncPullRequest({ github, getOctokit, core, owner, repo, number }) {
  const { repository } = await github.graphql(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          closingIssuesReferences(first: 20) { nodes { number repository { nameWithOwner } } }
        }
      }
    }`,
    { owner, repo, number },
  );
  const issues = repository.pullRequest.closingIssuesReferences.nodes.filter(
    (i) => i.repository.nameWithOwner === `${owner}/${repo}`,
  );
  if (issues.length === 0) core.info(`PR #${number} doesn't close any issue.`);
  for (const { number: issueNumber } of issues) {
    await syncIssue({ getOctokit, core, owner, repo, number: issueNumber });
  }
}

// For the claim and stale-claims workflows: a board failure must never undo or block a claim.
async function syncIssueSafely(args) {
  try {
    await syncIssue(args);
  } catch (err) {
    args.core.warning(`Couldn't update the project board for #${args.number}: ${err.message}`);
  }
}

module.exports = { syncIssue, syncIssueSafely, syncPullRequest, targetStatus };

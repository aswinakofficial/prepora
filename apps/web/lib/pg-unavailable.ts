// Stands in for the `pg` (node-postgres) package in the Cloudflare production bundle — see the
// `alias` in app.config.ts. Production connects to Neon through @neondatabase/serverless;
// node-postgres is only for local databases (packages/db/src/client.ts), and it can't be bundled
// for Workers. If a deployment is ever pointed at a non-Neon DATABASE_URL, this fails loudly on the
// first query instead of the build silently shipping a driver that can't run there.
class Pool {
  constructor() {
    throw new Error(
      "This deployment can only connect to Neon (DATABASE_URL on *.neon.tech). The node-postgres " +
        "driver for other Postgres servers is available in local development only.",
    );
  }
}

export default { Pool };

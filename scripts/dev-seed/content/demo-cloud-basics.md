---
id: DEMO-CLOUD-BASICS-SET-1
organization: prepora-demo
exam: demo-cloud-basics
exam_variant: standard
year: 2026
subject: cloud-fundamentals
title: Demo Cloud Basics — Practice Set 1
source_type: editorial
---

<!-- Invented demo content for local development (pnpm db:seed:dev). Not from any real exam. -->

# Question 1

A team wants its web app to keep serving requests when one server fails. Which design meets this requirement?

- A. Run one larger server
- B. Run two or more servers behind a load balancer
- C. Restart the server every night
- D. Store the app's logs on a second disk

**Answer:** B

**Explanation:**

A load balancer spreads requests across several servers and stops sending traffic to a server that fails, so the app keeps running. A larger single server is still a single point of failure.

**Topic:** High Availability

**Difficulty:** easy

# Question 2

Which two practices reduce the impact of a leaked access key? Choose two.

- A. Give each key only the permissions it needs
- B. Share one key across all services
- C. Rotate keys on a regular schedule
- D. Store keys in the source code repository

**Answer:** A, C

**Explanation:**

Least-privilege keys limit what a leaked key can do, and rotation limits how long it stays useful. Sharing keys or committing them to a repository makes a leak both more likely and more damaging.

**Topic:** Security

**Difficulty:** medium

# Question 3

You store nightly backups that are rarely read but must be kept for a year. Which storage option usually costs the least?

- A. Premium solid-state block storage
- B. An archive storage tier
- C. An in-memory cache
- D. The web server's local disk

**Answer:** B

**Explanation:**

Archive tiers are priced for data that is written once and read rarely: storage is cheap, and slower, occasional retrieval is acceptable for backups.

**Topic:** Storage

**Difficulty:** easy

# Question 4

An app's traffic doubles every weekday morning and drops at night. Which approach matches capacity to demand with the least manual work?

- A. Buy enough servers for the peak and keep them running
- B. Scale the number of servers automatically based on load
- C. Ask users to visit at night
- D. Resize the database by hand each morning

**Answer:** B

**Explanation:**

Autoscaling adds servers when load rises and removes them when it falls, so you pay for peak capacity only while you need it.

**Topic:** Scalability

**Difficulty:** medium

# Question 5

Which statement describes the shared responsibility model?

- A. The cloud provider is responsible for everything, including your data
- B. The customer is responsible for the physical data centres
- C. Responsibilities are split: the provider secures the infrastructure, the customer secures what they put on it
- D. Security is optional for managed services

**Answer:** C

**Explanation:**

The provider secures the underlying facilities, hardware and platform; the customer remains responsible for their data, identities, access settings and configuration.

**Topic:** Security

**Difficulty:** easy

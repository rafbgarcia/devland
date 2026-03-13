export const PULL_REQUESTS_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 30
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        id
        number
        title
        url
        isDraft
        state
        author {
          login
        }
        comments(first: 20) {
          totalCount
          nodes {
            author {
              login
            }
          }
        }
        labels(first: 10) {
          nodes {
            name
            color
          }
        }
        createdAt
        commits {
          totalCount
        }
        additions
        deletions
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();

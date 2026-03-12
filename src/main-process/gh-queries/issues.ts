export const ISSUES_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(
      first: 100
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        id
        number
        title
        url
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
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();

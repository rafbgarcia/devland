export const ISSUE_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id
      number
      title
      url
      state
      bodyHTML
      author {
        login
        avatarUrl
      }
      labels(first: 10) {
        nodes {
          name
          color
        }
      }
      comments(first: 50) {
        totalCount
        nodes {
          id
          bodyHTML
          createdAt
          author {
            login
            avatarUrl
          }
        }
      }
      createdAt
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();

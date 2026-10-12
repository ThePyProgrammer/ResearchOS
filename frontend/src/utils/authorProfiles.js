export const PROFILE_FIELDS = [
  { key: 'websiteUrl', icon: 'website', label: 'Website', placeholder: 'https://…', toUrl: value => value },
  { key: 'linkedinUrl', icon: 'linkedin', label: 'LinkedIn', placeholder: 'https://www.linkedin.com/in/username', toUrl: value => value },
  { key: 'twitterUrl', icon: 'x', label: 'X / Twitter', placeholder: 'https://x.com/username', toUrl: value => value },
  { key: 'googleScholarUrl', icon: 'googlescholar', label: 'Google Scholar', placeholder: 'https://scholar.google.com/…', toUrl: value => value },
  { key: 'githubUsername', icon: 'github', label: 'GitHub', placeholder: 'username', toUrl: value => 'https://github.com/' + value },
  { key: 'orcid', icon: 'orcid', label: 'ORCID', placeholder: '0000-0000-0000-0000', toUrl: value => 'https://orcid.org/' + value },
  { key: 'openreviewUrl', icon: 'openreview', label: 'OpenReview', placeholder: 'https://openreview.net/…', toUrl: value => value },
]

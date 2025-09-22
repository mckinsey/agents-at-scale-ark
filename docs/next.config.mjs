import nextra from 'nextra'

// Set up Nextra with its configuration
const withNextra = nextra({
  // Enable Mermaid diagrams
  mdxOptions: {
    remarkPlugins: [],
    rehypePlugins: []
  }
})

// Configure basePath for GitHub Pages deployment
// Use NEXT_PUBLIC_BASE_PATH environment variable or default to empty string
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Export the final Next.js config with Nextra included
export default withNextra({
  // ... Add regular Next.js options here
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: basePath,
  images: {
    unoptimized: true
  },
  turbopack: {}
})
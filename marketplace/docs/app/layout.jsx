import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
 
export const metadata = {
  title: "Agents at Scale Marketplace",
  description: "A collection of services, agents, and tools for the Agents at Scale (ARK) platform",
}

const navbar = (
  <Navbar
    logo={<b>ARK Marketplace</b>}
    projectLink="https://github.com/mckinsey/agents-at-scale-ark"
  />
)

const footer = <Footer>MIT {new Date().getFullYear()} © McKinsey QuantumBlack.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
    >
      <Head>
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/mckinsey/agents-at-scale-ark/tree/main/marketplace/docs"
          footer={footer}
          sidebar={{
            defaultMenuCollapseLevel: 1,
            autoCollapse: true
          }}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}

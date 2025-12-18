import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Banner, Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'
import './globals.css'
 
export const metadata = {
  // Define your metadata here
  // For more information on metadata API, see: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
  title: "Agents at Scale",
  description: "The McKinsey QuantumBlack Agentic Ecosystem",
}
const navbar = (
  <Navbar
    logo={<b>Agents at Scale</b>}
    projectLink="https://github.com/mckinsey/agents-at-scale-ark"
  
    // ... Your additional navbar options
  />
)
const footer = <Footer>MIT {new Date().getFullYear()} © Nextra.</Footer>
 
export default async function RootLayout({ children }) {
  return (
    <html
      // Not required, but good for SEO
      lang="en"
      // Required to be set
      dir="ltr"
      // Suggested by `next-themes` package https://github.com/pacocoursey/next-themes#with-app
      suppressHydrationWarning
    >
      <Head
      // ... Your additional head options
      >
        {/* Your additional tags should be passed as `children` of `<Head>` element */}
      </Head>
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/mckinsey/agents-at-scale-ark/tree/main/docs"
          footer={footer}
          sidebar={{
            defaultMenuCollapseLevel: 1,
            autoCollapse: false
          }}
          // ... Your additional layout options
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}

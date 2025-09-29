import { EventsSection } from "@/components/sections/events-section"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

type SearchParams = {
  page?: string
  limit?: string
  type?: string
  kind?: string
  name?: string
}

const defaultPage = 1;
const defaultLimit = 10;

export default async function EventsPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>
}) {
  const filters = (await searchParams)

  const parsedFilters = {
    page: filters.page ? parseInt(filters.page, 10): defaultPage,
    limit: filters.limit ? parseInt(filters.limit, 10): defaultLimit,
    type: filters.type,
    kind: filters.kind,
    name: filters.name
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Events</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>
      <div className="flex flex-1 flex-col">
        <EventsSection {...parsedFilters}/>
      </div>
    </>
  )
}

'use client'
import { BreadcrumbElement, PageHeader } from "@/components/common/page-header"
import { UpdateModelForm } from "@/components/forms"
import { Spinner } from "@/components/ui/spinner"
import { useGetModelbyId } from "@/lib/services/models-hooks"
import { use } from 'react'

const breadcrumbs: BreadcrumbElement[] = [
  { href: '/', label: "ARK Dashboard" },
  { href: '/models', label: 'Models' }
]

type PageProps = {
  params: Promise<{ model_id: string }>
}

export default function ModelUpdatePage({ params }: PageProps) {
  const { model_id } = use(params)
  const { data, isPending } = useGetModelbyId({ model_id })

  return (
    <div className="min-h-screen flex flex-col">
      <PageHeader breadcrumbs={breadcrumbs} currentPage={model_id} />
      {isPending && (
        <div className="w-full flex justify-center items-center flex-1">
          <Spinner />
        </div>
      )}
      <main className="container px-6 py-8">
        {data && (<UpdateModelForm model={data} />)}
      </main>
    </div>
  )
}
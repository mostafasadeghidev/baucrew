import Image from 'next/image'

/**
 * Renders the configurable branding: the uploaded logo when present,
 * otherwise the (equally configurable) company name as text.
 */
export function BrandMark({
  hasLogo,
  name,
  imgClassName = 'h-8',
  textClassName = 'text-lg font-bold tracking-tight',
}: {
  hasLogo: boolean
  name: string
  imgClassName?: string
  textClassName?: string
}) {
  if (!hasLogo) {
    return <span className={textClassName}>{name}</span>
  }
  return (
    <span className="inline-flex rounded bg-white px-2 py-1">
      <Image
        src="/logo"
        unoptimized
        priority
        alt={name}
        width={727}
        height={186}
        className={`${imgClassName} w-auto`}
      />
    </span>
  )
}

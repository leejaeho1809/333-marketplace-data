import { useMarketplace } from '@/context/MarketplaceProvider'

export function Toast() {
  const { toast } = useMarketplace()
  return (
    <div
      className={
        'pointer-events-none fixed bottom-7 left-1/2 z-[300] -translate-x-1/2 bg-ink px-[22px] py-3 text-[13px] text-white transition-all duration-250 ease-out ' +
        (toast ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0')
      }
    >
      {toast}
    </div>
  )
}

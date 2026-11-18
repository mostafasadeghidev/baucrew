/**
 * The trades a card added at the foot of a list is for, ticked as chips —
 * with the customer they are its name, "Muster GmbH · Malern".
 */
export function TradePicker({ trades, legend }: { trades: Array<{ value: string; label: string }>; legend: string }) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-1">
        {trades.map((trade) => (
          <label key={trade.value} className="cursor-pointer">
            <input type="checkbox" name="categoryIds" value={trade.value} className="peer sr-only" />
            <span className="block rounded-full border border-border-strong bg-surface px-2 py-0.5 text-xs text-muted transition-colors hover:text-foreground peer-checked:border-accent peer-checked:bg-accent/10 peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              {trade.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

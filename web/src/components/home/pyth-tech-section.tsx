import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function PythTechSection() {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Powered by Pyth Network</h2>
        <p className="text-xs text-muted-foreground">
          Dual-oracle architecture for real-time data and on-chain verification
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pyth Lazer */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-violet-500/20 text-violet-500 border-violet-500/30 text-xs">On-Chain</Badge>
              <CardTitle className="text-base">Pyth Lazer</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-violet-500 mt-0.5">-</span>
                <span>Price discovery at epoch creation &amp; settlement</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-violet-500 mt-0.5">-</span>
                <span>Confidence intervals determine epoch validity</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-violet-500 mt-0.5">-</span>
                <span>Ed25519 signature verification on FOGO chain</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Pyth Hermes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs">Real-Time</Badge>
              <CardTitle className="text-base">Pyth Hermes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">-</span>
                <span>SSE streaming for live price updates</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">-</span>
                <span>Sub-second price data in the trading UI</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-0.5">-</span>
                <span>Oracle health monitoring with staleness &amp; confidence tracking</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

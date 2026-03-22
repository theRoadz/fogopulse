'use client'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, MoreVertical, ChevronDown } from 'lucide-react'
import { ModeToggle } from '@/components/shared/mode-toggle'
import { ClusterUiSelect } from './cluster/cluster-ui'
import { WalletButton } from '@/components/wallet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWallet } from '@solana/wallet-adapter-react'
import { ASSETS } from '@/types/assets'
import { ASSET_METADATA } from '@/lib/constants'
import { useIsAdmin } from '@/hooks/use-is-admin'

const overflowLinks = [
  { label: 'Balance', href: '/account' },
  { label: 'Trade History', href: '/trades' },
  { label: 'Settlement History', href: '/settlements' },
]

const utilityLinks = [
  { label: 'Faucet', href: '/faucet' },
  { label: 'Feedback', href: '/feedback' },
]

export function AppHeader() {
  const pathname = usePathname()
  const [showMenu, setShowMenu] = useState(false)
  const { publicKey } = useWallet()
  const { isAdmin } = useIsAdmin()

  function isActive(path: string) {
    return path === '/' ? pathname === '/' : pathname.startsWith(path)
  }

  return (
    <header className="relative z-50 px-4 py-2 bg-neutral-100 dark:bg-neutral-900 dark:text-neutral-400">
      <div className="mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Link className="text-xl font-bold hover:text-neutral-500 dark:hover:text-white" href="/">
            <span className="text-primary">FOGO</span> Pulse
          </Link>
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={`gap-1 ${isActive('/trade') ? 'text-neutral-500 dark:text-white' : ''}`}
                >
                  Markets
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {ASSETS.map((asset) => (
                  <DropdownMenuItem key={asset} asChild>
                    <Link href={`/trade/${asset.toLowerCase()}`}>
                      <span className={ASSET_METADATA[asset].color}>
                        {ASSET_METADATA[asset].label}
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          <Link
            className={`text-sm font-medium hover:text-neutral-500 dark:hover:text-white ${isActive('/lp') ? 'text-neutral-500 dark:text-white' : ''}`}
            href="/lp"
          >
            Pools
          </Link>
        </div>

        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setShowMenu(!showMenu)}>
          {showMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>

        <div className="hidden md:flex items-center gap-4">
          {utilityLinks.map(({ label, href }) => (
            <Link
              key={href}
              className={`text-sm hover:text-neutral-500 dark:hover:text-white ${isActive(href) ? 'text-neutral-500 dark:text-white' : ''}`}
              href={href}
            >
              {label}
            </Link>
          ))}
          {publicKey && isAdmin && (
            <Link
              className={`text-sm hover:text-neutral-500 dark:hover:text-white ${isActive('/admin') ? 'text-neutral-500 dark:text-white' : ''}`}
              href="/admin"
            >
              Admin
            </Link>
          )}
          <ModeToggle />
          <ClusterUiSelect />
          <WalletButton />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="overflow-menu-trigger">
                <MoreVertical className="h-5 w-5" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowLinks.map(({ label, href }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href}>{label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showMenu && (
          <div className="md:hidden fixed inset-x-0 top-[52px] bottom-0 bg-neutral-100/95 dark:bg-neutral-900/95 backdrop-blur-sm">
            <div className="flex flex-col p-4 gap-4 border-t dark:border-neutral-800">
              {/* Markets section */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
                  Markets
                </p>
                <ul className="flex flex-col gap-2">
                  {ASSETS.map((asset) => (
                    <li key={asset}>
                      <Link
                        className={`hover:text-neutral-500 dark:hover:text-white block text-lg py-1 ${
                          isActive(`/trade/${asset.toLowerCase()}`) ? 'text-neutral-500 dark:text-white' : ''
                        }`}
                        href={`/trade/${asset.toLowerCase()}`}
                        onClick={() => setShowMenu(false)}
                      >
                        <span className={ASSET_METADATA[asset].color}>{ASSET_METADATA[asset].label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pools link */}
              <div className="border-t dark:border-neutral-800 pt-4">
                <Link
                  className={`hover:text-neutral-500 dark:hover:text-white block text-lg py-2 ${isActive('/lp') ? 'text-neutral-500 dark:text-white' : ''}`}
                  href="/lp"
                  onClick={() => setShowMenu(false)}
                >
                  Pools
                </Link>
              </div>

              {/* Utility links */}
              <div className="border-t dark:border-neutral-800 pt-4">
                <ul className="flex flex-col gap-4">
                  {utilityLinks.map(({ label, href }) => (
                    <li key={href}>
                      <Link
                        className={`hover:text-neutral-500 dark:hover:text-white block text-lg py-2 ${isActive(href) ? 'text-neutral-500 dark:text-white' : ''}`}
                        href={href}
                        onClick={() => setShowMenu(false)}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Admin link (mobile) */}
              {publicKey && isAdmin && (
                <div className="border-t dark:border-neutral-800 pt-4">
                  <Link
                    className={`hover:text-neutral-500 dark:hover:text-white block text-lg py-2 ${isActive('/admin') ? 'text-neutral-500 dark:text-white' : ''}`}
                    href="/admin"
                    onClick={() => setShowMenu(false)}
                  >
                    Admin
                  </Link>
                </div>
              )}

              {/* Overflow links */}
              <div className="border-t dark:border-neutral-800 pt-4">
                <ul className="flex flex-col gap-4">
                  {overflowLinks.map(({ label, href }) => (
                    <li key={href}>
                      <Link
                        className={`hover:text-neutral-500 dark:hover:text-white block text-lg py-2 ${isActive(href) ? 'text-neutral-500 dark:text-white' : ''}`}
                        href={href}
                        onClick={() => setShowMenu(false)}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-4">
                <ModeToggle />
                <ClusterUiSelect />
                <WalletButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

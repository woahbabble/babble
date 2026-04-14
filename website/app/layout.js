import Link from 'next/link'
import './globals.css'
import TokenBridgeClient from '../components/TokenBridgeClient'
import BridgeNoticeClient from '../components/BridgeNoticeClient'
import ThemeSwitcherClient from '../components/ThemeSwitcherClient'

export const metadata = {
  title: 'Babble',
  description: 'The public conversation layer for every URL.'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <TokenBridgeClient />
        <BridgeNoticeClient />
        <header className="topbar">
          <div className="container topbar-inner">
            <Link href="/" className="brand">
              babble
            </Link>
            <nav className="nav">
              <Link href="/">top</Link>
              <Link href="/search">search</Link>
              <Link href="/account">account</Link>
              <Link href="/admin">admin</Link>
            </nav>
            <ThemeSwitcherClient />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  )
}

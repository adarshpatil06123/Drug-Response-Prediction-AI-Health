import './globals.css'

export const metadata = {
  title: 'AI Drug Response Predictor',
  description: 'AI-powered drug response prediction system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="font-display">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link 
          rel="stylesheet" 
          href="https://fonts.googleapis.com/css2?display=swap&family=Inter:wght@400;500;700;900" 
        />
        <link 
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" 
          rel="stylesheet" 
        />
      </head>
      <body className="font-display bg-gray-50 dark:bg-gray-900">{children}</body>
    </html>
  )
}

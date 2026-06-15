export function Logo({ size = 30 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        background: 'linear-gradient(135deg, #0A84FF, #22D3EE)',
        boxShadow: '0 4px 12px -4px rgba(10,132,255,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="7" r="2.1" />
        <circle cx="18" cy="5" r="2.1" />
        <circle cx="17" cy="18" r="2.1" />
        <path d="M7.7 8.2 16.3 16.4" />
        <path d="M7.6 6 16 5.4" />
      </svg>
    </div>
  )
}

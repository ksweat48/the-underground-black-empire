export function EmpireBackground() {
  return (
    <div className="fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* White background matching card surfaces */}
      <div
        className="absolute inset-0"
        style={{
          background: '#FFFFFF',
        }}
      />
      {/* Subtle noise / paper grain texture at low opacity */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
          backgroundSize: '200px 200px',
          opacity: 0.015,
          mixBlendMode: 'multiply',
        }}
      />
    </div>
  );
}

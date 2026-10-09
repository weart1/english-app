/**
 * Static decorative background: gradient + blurred blobs.
 * Rendered once at the root, never animated (battery / performance).
 */
export function Background() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, var(--bg-top) 0%, var(--bg-bottom) 100%)' }}>
      <div
        className="absolute rounded-full"
        style={{
          width: '70vmax',
          height: '70vmax',
          top: '-28vmax',
          right: '-30vmax',
          background: 'var(--blob-blue)',
          opacity: 0.45,
          filter: 'blur(80px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '55vmax',
          height: '55vmax',
          bottom: '-24vmax',
          right: '-22vmax',
          background: 'var(--blob-blue)',
          opacity: 0.3,
          filter: 'blur(90px)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: '28vmax',
          height: '28vmax',
          top: '34%',
          left: '-12vmax',
          background: 'var(--blob-yellow)',
          opacity: 0.35,
          filter: 'blur(70px)',
        }}
      />
    </div>
  );
}

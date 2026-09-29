import { Link } from 'react-router-dom';

export function Header() {
  return (
    <header className="sticky top-0 z-50 glass-site-header">
      <div className="container-empire relative flex h-16 items-center justify-center">
        <Link
          to="/"
          className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 transition-transform duration-200 hover:scale-[1.03]"
          aria-label="Go to home page"
        >
          <img
            src="/UBE_text_logo.png"
            alt="The Underground Black Empire"
            className="h-12 w-auto max-w-[160px] object-contain"
          />
        </Link>
      </div>
    </header>
  );
}

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="mt-8 border-t border-blue-900/40 bg-zinc-900/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-6 text-center text-sm text-zinc-500">
        <p suppressHydrationWarning>
          © {CURRENT_YEAR} BastionDesk. Wszystkie prawa zastrzeżone.
        </p>
        <p className="mt-2">
          System do zarządzania incydentami bezpieczeństwa IT
        </p>
      </div>
    </footer>
  );
}

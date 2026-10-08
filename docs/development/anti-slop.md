# Anti-slop w BastionDesk

Reguły pochodzą z [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop)
i są utrzymywane lokalnie w `tools/oxlint/anti-slop/`. Kopia obejmuje wyłącznie
trzy wybrane reguły, ich testy oraz wspólny helper. Zachowano licencję MIT.
Commit upstream i sumy plików zapisano w `UPSTREAM.json`; lokalny `index.ts`
rejestruje wybrany podzbiór.

## Polityka początkowa

Frontend i backend włączają jako `warn`:

- `anti-slop/no-chained-type-assertions` — rzutowania takie jak `as unknown as T`;
- `anti-slop/no-widen-then-assert` — utrata informacji o typie i późniejsze rzutowanie;
- `anti-slop/no-reduce-accumulator-copy` — kopiowanie akumulatora w redukcji;
- natywne `oxc/no-accumulating-spread` — spread rosnącego akumulatora.

Ostrzeżenia są widoczne w zwykłym `bun run lint` i `bun run check`, także w testach.
Nie blokują CI. Pierwszy pomiar 8 października 2026 wykazał 21 ostrzeżeń backendu
i 2 frontendu, wszystkie z `no-chained-type-assertions`. Przed zmianą wybranej
reguły na `error` trzeba przejrzeć zgłoszenia, poprawić kontrakty lub uzasadnić
konkretne wyjątki. Nie należy usuwać ostrzeżeń przez zastępowanie ich `any`.

Nie włączamy zakazów `typeof`, parametrów `unknown`, `filter().map()` ani nazw
zawierających `shape`. Kontrakty `unknown` na granicach z danymi zewnętrznymi
wymagają oceny kontekstu. Reguły `no-unknown-returns`, komentarze uzasadniające
rzutowania oraz osobny zestaw Effect pozostają kandydatami do kolejnego przeglądu.

## Weryfikacja i aktualizacje

`bun run check` uruchamia również `bun run test:lint-rules`: trzy oryginalne
zestawy testów `RuleTester` upstream. Wymagają Node.js 22.18+ z natywnym
uruchamianiem TypeScript albo Node.js 24+; RuleTester nie obsługuje Bun.
Oxlint używa Node również do ładowania pluginów. `oxlint` i `@oxlint/plugins`
przypinamy do tej samej dokładnej wersji, obecnie `1.87.0`, we wszystkich manifestach.

Turbo uwzględnia pliki `tools/oxlint/anti-slop/**` w wejściach zadania `lint`,
więc zmiana reguł unieważnia cache obu workspace’ów. Skopiowane źródła nie są
formatowane ani lintowane przez workspace’y; zachowują postać upstream.

Aktualizując kopię, pobierz nowy commit do osobnego katalogu, porównaj wybrane
pliki z rewizją zapisaną w `UPSTREAM.json`, przejrzyj zmiany i zachowaj lokalny
wybór reguł oraz ich poziomy. Po aktualizacji uruchom `bun run test:lint-rules`
i `bun run check`, a następnie uaktualnij rewizję i sumy plików. Nie uruchamiaj
instalatora upstream automatycznie: domyślnie włącza szerszy zestaw reguł.

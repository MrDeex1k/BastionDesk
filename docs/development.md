# Praca maintainerów

Zmiany kodu i dokumentacji realizują maintainerzy oraz zaproszeni współpracownicy.
Publiczny kanał zgłoszeń opisuje [ISSUES.md](../ISSUES.md).

## Branche i squash & merge

Nazwy branchy mają format `<type>/<krótki-opis>`, np. `feat/implement-stage1`
albo `feat/implement-auth`. Typ odpowiada planowanemu commitowi squash
(`feat`, `fix`, `chore`, `docs`, `refactor`, `test` itd.). Opis zapisujemy
małymi literami, z łącznikami między słowami.

Nazwa brancha jest krótkim opisowym skrótem planowanego tytułu commita
**squash & merge**, a nie hashem commita. Zachowuje typ i główny cel zmiany;
może pomijać scope i szczegóły. Nie musi kopiować całego tytułu.
Nazwy branchy nie mogą zawierać słowa `codex` w żadnej wielkości liter,
również jako prefiksu `codex/`. Zasada dotyczy wszystkich autorów i agentów.

| Planowany tytuł commita squash & merge | Nazwa brancha |
| --- | --- |
| `feat(platform): implement stage 1 interface foundations` | `feat/implement-stage1` |
| `feat(auth): implement authentication gateway` | `feat/implement-auth` |
| `fix(auth): preserve registration error responses` | `fix/registration-errors` |
| `chore(deps): update backend dependencies` | `chore/update-backend-deps` |
| `docs(workflow): define branch naming conventions` | `docs/branch-naming` |

Pull requesty do `main` integrujemy przez **Squash and merge**, zamiast
**Create a merge commit**. Końcowy tytuł i opis commita opisują cały zakres PR,
zgodnie z Conventional Commits. Commity robocze na branchu mogą dokumentować
kolejne kroki; do `main` trafia jeden commit squash dla danego PR.
Przed scaleniem dopasowujemy tytuł i opis do ostatecznego zakresu zmian.

Ta reguła określa sposób zamykania PR do `main`. Synchronizacja roboczego
brancha z `main` jest osobną operacją i może obejmować merge, jeżeli jest
potrzebny w uzgodnionym toku pracy.

## Development Checks

Z katalogu głównego można uruchomić kontrole obu pakietów przez TurboRepo:

```bash
bun install
bun run check
```

Repozytorium korzysta z Conventional Commits. Commit musi mieć postać `<type>(<scope>): <opis>`
lub `<type>: <opis>`, np. `feat(frontend): dodaj filtrowanie incydentów`. Hooki Husky uruchamiają
kontrole przed commitem i odrzucają niepoprawny nagłówek wiadomości.

Sekcję wydania w `CHANGELOG.md` generuj z historii Conventional Commits poleceniem:

```bash
bun run changelog:generate
```

Przed generowaniem ustaw wersję wydania w rootowym `package.json`; dla tego wydania jest to
`1.0.3`.

Przed otwarciem wewnętrznego PR uruchom kontrole odpowiednie dla zmienionego zakresu.

Backend:

- `cd backend`
- `bun run typecheck`
- `bun run lint`

Frontend:

- `cd frontend`
- `bun run build`
- `bun run lint`

If your change affects setup, deployment, environment variables, Docker, TLS, or operational behavior, update the relevant documentation in the same pull request.

## Wewnętrzne pull requesty

PR powinien obejmować jeden temat, wskazywać powiązane Issue, jeśli istnieje,
i opisywać zmianę, jej przyczynę oraz sposób weryfikacji. Aktualizuj dokumentację
razem ze zmianą zachowania. Sprawdź, czy diff nie zawiera sekretów ani danych klientów.

## Ustawienia GitHub

W `Settings → General → Features` pozostaw Issues dostępne dla wszystkich,
a dostęp do Pull requests ustaw na `Collaborators only`. To ustawienie GitHub
ogranicza tworzenie PR; same pliki dokumentacji nie zmieniają dostępu.
Szablony zgłoszeń z `.github/ISSUE_TEMPLATE/` zaczną działać po scaleniu do `main`.

Źródła: [dostęp do PR](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/disabling-pull-requests),
[szablony Issues](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates).

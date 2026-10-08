# Zgłoszenia do BastionDesk

Publiczne zgłoszenia przyjmujemy przez [GitHub Issues](https://github.com/MrDeex1k/BastionDesk/issues).
Możesz zgłosić błąd, zaproponować funkcję albo zadać pytanie dotyczące projektu.
Zmiany kodu i dokumentacji realizują maintainerzy oraz zaproszeni współpracownicy.
Nie przyjmujemy zewnętrznych pull requestów i nie prowadzimy procedury CLA.

## Jak utworzyć zgłoszenie

1. Przeszukaj istniejące Issues, również zamknięte. Jeśli problem jest już opisany,
   dopisz nowe informacje do odpowiedniego zgłoszenia.
2. Otwórz [nowe Issue](https://github.com/MrDeex1k/BastionDesk/issues/new/choose)
   i wybierz szablon: błąd, propozycja funkcji lub pytanie.
3. Nadaj konkretny tytuł i uzupełnij sekcje szablonu. Dane, których nie znasz,
   oznacz jako „nie wiem”; informacje nieistotne jako „nie dotyczy”.

Dla błędu podaj wersję, sposób instalacji, kroki odtworzenia oraz oczekiwany
i faktyczny rezultat. Propozycję funkcji zacznij od problemu, który ma rozwiązać.
W pytaniu opisz cel i to, co już sprawdziłeś. Dołącz tylko informacje potrzebne
do zrozumienia zgłoszenia; nie jest wymagane przygotowanie poprawki w kodzie.

## Dane w zgłoszeniu

Issues są publiczne. Usuń hasła, tokeny, prywatne klucze, cookies, dane klientów
oraz inne dane wrażliwe z logów i zrzutów ekranu. Nie załączaj prawdziwego `.env`;
konfigurację pokazuj z placeholderami na podstawie `.env.example`.

## Podatności bezpieczeństwa

Zgłaszaj je prywatnie zgodnie z [SECURITY.md](SECURITY.md), przez GitHub
[Report a vulnerability](https://github.com/MrDeex1k/BastionDesk/security/advisories/new).
Publiczne Issue nie jest miejscem na szczegóły exploita ani dowód koncepcji.

## Obsługa zgłoszenia

Maintainerzy mogą poprosić o dodatkowe informacje, oznaczyć duplikat lub zamknąć
zgłoszenie poza zakresem projektu. Utworzenie Issue nie oznacza zobowiązania
do wdrożenia funkcji ani terminu realizacji. Przyjęte zmiany przechodzą wewnętrzny
PR oraz squash & merge zgodnie z [zasadami pracy](docs/development.md).

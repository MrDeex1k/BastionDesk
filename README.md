# BastionDesk

BastionDesk to autorska platforma helpdesk do obsługi incydentów cyberbezpieczeństwa, zaprojektowana jako przystępna kosztowo alternatywa dla rozbudowanych systemów klasy enterprise. Projekt powstał z myślą o organizacjach, które potrzebują uporządkowanego procesu zgłaszania, klasyfikacji i obsługi incydentów w duchu wymagań NIS-2.

System wspiera cały podstawowy cykl pracy z incydentem: od zgłoszenia przez pracownika, przez analizę i priorytetyzację, po obsługę przez analityka i nadzór administracyjny. Ważnym elementem rozwiązania jest lokalny moduł AI, który pomaga klasyfikować zgłoszenia i skraca czas reakcji zespołu.

BastionDesk jest przeznaczony przede wszystkim dla:
- małych i średnich przedsiębiorstw
- organizacji budujących własny lub współdzielony SOC
- instytucji i zespołów, które szukają lżejszego, bardziej dostępnego wejścia w obszar cyberbezpieczeństwa operacyjnego

Projekt łączy nowoczesny stos webowy, architekturę modułową oraz nacisk na bezpieczeństwo komunikacji między usługami, dzięki czemu może pełnić rolę praktycznej bazy pod dalszy rozwój w kierunku platformy SOAR.

## Licencja

BastionDesk Community Edition jest udostępniany jako open source na licencji GNU Affero General Public License v3.0 (`AGPL-3.0-only`). Pełny tekst licencji znajduje się w pliku `LICENSE`.

Dla organizacji, które potrzebują użycia komercyjnego niezgodnego z obowiązkami AGPLv3, prywatnych forków, osadzania w produkcie własnym lub dystrybucji/SaaS bez obowiązków AGPLv3, może być dostępna osobna licencja komercyjna po indywidualnym uzgodnieniu.

Zasady przyjmowania wkładu zewnętrznego opisuje `CONTRIBUTING.md`.

## TechStack
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Oxc](https://img.shields.io/badge/oxc-%233451b2.svg?style=for-the-badge&logo=oxc&logoColor=white&logoSize=auto) ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white) ![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![React Router](https://img.shields.io/badge/React_Router-CA4245?style=for-the-badge&logo=react-router&logoColor=white) ![React Query](https://img.shields.io/badge/-React%20Query-FF4154?style=for-the-badge&logo=react%20query&logoColor=white) ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB) ![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)

![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54) ![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi) ![HuggingFace](https://img.shields.io/badge/huggingface-%23FFD21E.svg?style=for-the-badge&logo=huggingface&logoColor=white)

![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white) ![Amazon S3](https://img.shields.io/badge/Amazon%20S3-FF9900?style=for-the-badge&logo=amazons3&logoColor=white)

![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)


## Proces uruchomienia

1. Wchodzimy w katalog BastionDesk.
2. Uruchamiamy komendę "docker compose build" .
3. Uruchamiamy komendę "docker compose up" lub "docker compose up -d", jeśli chcemy uruchomić w tle.
4. Z aplikacji korzystamy przez `http://localhost:4567` - to jedyny publiczny entrypoint stacka.

## Deployment

Model wdrożenia jest opisany w:

- [docs/infrastructure/deploy.md](docs/infrastructure/deploy.md)

Najważniejsze założenia release:

- wspierany jest self-hosted Docker Compose,
- model wdrożenia to `fresh install only`,
- główny punkt wejścia do aplikacji to `http://localhost:4567`.

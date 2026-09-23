# Trwałe zadania w PostgreSQL, dostarczanie przez RabbitMQ

Klasyfikacja incydentu nie może zniknąć po zatwierdzeniu jego utworzenia, dlatego
zapis zadania/outbox następuje w tej samej transakcji PostgreSQL, a RabbitMQ
rozdziela dostarczenia między workerami przez trwałą kolejkę quorum, publisher
confirms i ręczne ACK. PostgreSQL przechowuje także próby, termin ponowienia,
wynik inbox oraz DLQ; okresowy relay odtwarza dostarczenia bez ukończonego
wyniku, więc utrata brokera nie usuwa źródła prawdy.

Redis jest zarezerwowany dla odtwarzalnych cache/limitów, nie dla receipts,
blokad poprawności ani stanu workflow; w tej fazie nie ma uzasadnionego
konsumenta Redis i nie dokładamy pustej usługi do stosu. Wybrano klasyfikację
LLM jako pierwszy worker: wywołanie obliczenia może się powtórzyć po awarii,
ale zapis kategorii i audytu jest atomowy z ukończeniem zadania, z kontrolą
aktualnego tokenu dzierżawy. Nie deklarujemy exactly-once dla zewnętrznych API.

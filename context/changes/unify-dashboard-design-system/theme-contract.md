# Kontrakt motywu UI

## Źródło i zakres

Motyw Dishly mapuje snapshot `cagops` z `theme-source.json` na istniejące role semantyczne w `src/styles/global.css`. Snapshot pochodzi z [tweakcn](https://tweakcn.com/themes/cmnjexv1n000304jse9nq2jra), został pobrany 12 października 2026 i pozostaje niezmiennym zapisem źródła. `:root` jest produkcyjnym wariantem jasnym. `.dark` służy obecnie do kontroli kontraktu w izolowanym podglądzie; ten slice nie dodaje przełącznika motywu.

`@theme inline` udostępnia role klasom Tailwind. Komponenty i widoki korzystają z nazw semantycznych, takich jak `bg-card`, `text-muted-foreground`, `ring-ring` i `shadow-surface`. Nie kopiują wartości kolorów ze snapshotu. Istniejący `bg-cosmic` pozostaje bez zmian dla ekranów poza zakresem dashboardu.

## Korekty dostępności i stany

Wartości źródłowe są zachowane poza poniższymi, udokumentowanymi korektami:

- jasne `accent-foreground` i `sidebar-accent-foreground` używają `#A6402F` zamiast `#B94E3A`, aby tekst na `#F4E0D6` osiągał co najmniej 4,5:1;
- ciemne `muted-foreground` używa `#9AAEBB` zamiast `#3F5A6A`, aby tekst był czytelny na `muted` i tle strony;
- ciemne `ring` i `sidebar-ring` używają `#E39A7C` zamiast `#B94E3A`, aby wskaźnik focus osiągał co najmniej 3:1 również przy powierzchni `card`;
- interaktywne role `primary-hover`, `secondary-hover`, `accent-hover` i `destructive-hover` są wartościami pochodnymi. Zapewniają przewidywalny stan hover bez mieszania koloru z przypadkową powierzchnią pod kontrolką. Jasny `primary-hover` używa `#A6402F`, ponieważ półprzezroczyste `primary/90` obniżało kontrast białego tekstu poniżej 4,5:1.

`scripts/ui-theme.test.mjs` czyta zastosowane zmienne z `global.css`. Sprawdza pary tekst/tło, ich stany hover oraz ring względem `background` i `card`. Tekst musi osiągać co najmniej 4,5:1, a wskaźnik focus co najmniej 3:1. Pełny, nieprzezroczysty `ring-ring` jest wspólnym stanem `focus-visible`. `destructive` oznacza faktyczny błąd lub niszczącą akcję; neutralne potwierdzenie i brak potwierdzenia importu używają `card` oraz `foreground`.

## Typografia i rytm

Tekst podstawowy korzysta z lokalnie hostowanego Montserrat w wagach 400–700. Stosy `Georgia, serif` oraz `JetBrains Mono, monospace` zachowujemy jako role źródłowe, ale nie pobieramy JetBrains Mono, dopóki widok go nie używa. Tracking pochodzi ze snapshotu: `-0.01em` w wariancie jasnym i `0.01em` w ciemnym. Bazą skali odstępów Tailwind pozostaje `0.25rem`; widoki nie dodają arbitralnych wymiarów.

Dashboard używa kontenera `max-w-4xl`, marginesów `px-4 sm:px-6` i `py-8 sm:py-12`, odstępu `gap-8` między sekcjami oraz `gap-4`–`gap-6` wewnątrz. Tytuł ma skalę `text-3xl sm:text-4xl`, nagłówek sekcji `text-xl`, a tekst `text-sm sm:text-base`.

## Radius i cienie

Źródłowy radius `0.5rem` zasila istniejące role `rounded-sm`–`rounded-xl`. Powierzchnie używają `rounded-xl`, kontrolki `rounded-lg`, a akcje mają co najmniej `min-h-11`. `shadow-surface` składa się z parametrów źródłowych: w jasnym motywie `0 2px 12px 0` z czernią 3%, w ciemnym `0 8px 24px 0` z czernią 25%. Przyciski zachowują mniejszy `shadow-xs`, aby hierarchia cienia odpowiadała rozmiarowi elementu.

import { CircleAlert, Info, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function ComponentPreview() {
  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="space-y-2">
        <p className="text-primary text-sm font-semibold">Dishly · podgląd komponentów</p>
        <h1 className="text-3xl font-bold tracking-tight">Zażółć gęślą jaźń</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Izolowany podgląd Card, Alert i Button w jasnym albo ciemnym motywie.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2" aria-label="Powierzchnie i komunikaty">
        <Card className="shadow-surface">
          <CardHeader>
            <CardTitle>Twoja kolekcja przepisów</CardTitle>
            <CardDescription>Przeglądanie zapisanych przepisów będzie dostępne wkrótce.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Karta pokazuje domyślną powierzchnię, obramowanie i rytm odstępów.</p>
          </CardContent>
          <CardFooter className="gap-3">
            <Button>Dodaj przepis</Button>
            <Button variant="outline">Anuluj</Button>
          </CardFooter>
        </Card>

        <div className="grid content-start gap-4">
          <Alert role="status" aria-live="polite">
            <Info aria-hidden="true" />
            <AlertTitle>Import zakończony</AlertTitle>
            <AlertDescription>Zapisano 3 przepisy. Jeden przepis był już w kolekcji.</AlertDescription>
          </Alert>
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Nie udało się wczytać danych</AlertTitle>
            <AlertDescription>Spróbuj ponownie za chwilę.</AlertDescription>
          </Alert>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="theme-roles-title">
        <div className="space-y-1">
          <h2 id="theme-roles-title" className="text-xl font-semibold">
            Role semantyczne
          </h2>
          <p className="text-muted-foreground text-sm">Kolor tekstu zawsze pochodzi z pary przypisanej do tła.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-primary text-primary-foreground rounded-lg p-4">Primary</div>
          <div className="bg-secondary text-secondary-foreground rounded-lg p-4">Secondary</div>
          <div className="bg-accent text-accent-foreground rounded-lg p-4">Accent</div>
          <div className="bg-destructive text-destructive-foreground rounded-lg p-4">Destructive</div>
          <div className="bg-muted text-muted-foreground rounded-lg p-4">Muted</div>
          <div className="bg-card text-card-foreground shadow-surface rounded-lg border p-4">Card</div>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="button-states-title">
        <h2 id="button-states-title" className="text-xl font-semibold">
          Stany przycisków
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button>Domyślny</Button>
          <Button variant="secondary">Drugorzędny</Button>
          <Button variant="outline">Obrys</Button>
          <Button variant="destructive">Usuń</Button>
          <Button disabled>Wyłączony</Button>
          <Button className="ring-ring ring-offset-background ring-3 ring-offset-2">Focus</Button>
          <Button aria-busy="true">
            <LoaderCircle className="animate-spin" /> Ładowanie
          </Button>
        </div>
      </section>
    </div>
  );
}

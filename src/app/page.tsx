import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-serif text-5xl tracking-tight">Selah</h1>
      <p className="text-lg text-stone-600 dark:text-stone-400">
        A self-hostable, open source lifestream for daily Bible reading.
      </p>
      <div>
        <Button asChild>
          <a href="https://github.com/mattsanchez/selah">View the project</a>
        </Button>
      </div>
    </main>
  );
}

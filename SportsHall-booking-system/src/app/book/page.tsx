import { Suspense } from "react";
import BookClient from "./BookClient";

export default function BookPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading…</div>}>
      <BookClient />
    </Suspense>
  );
}

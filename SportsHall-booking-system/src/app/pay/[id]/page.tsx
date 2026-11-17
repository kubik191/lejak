import { Suspense } from "react";
import PayClient from "./PayClient";

export default function PayPage({ params }: PageProps<"/pay/[id]">) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-10">
      <Suspense fallback={<div className="text-center text-sm text-slate-500">Loading…</div>}>
        {params.then(({ id }) => (
          <PayClient id={id} />
        ))}
      </Suspense>
    </div>
  );
}

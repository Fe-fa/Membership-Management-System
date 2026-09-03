import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/pages/member/DocumentsPage";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Documents & History — Aero Club of East Africa" },
      {
        name: "description",
        content:
          "A consolidated view of every section, uploaded document and payment recorded for your membership application.",
      },
    ],
  }),
  component: DocumentsPage,
});

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { orpc } from "../../../lib/orpc";
import { verifyAdminFn } from "../admin";

export const Route = createFileRoute("/admin/exam-types")({
  beforeLoad: async () => {
    const res = await verifyAdminFn();
    if (!res.ok) throw new Error("Unauthorized");
  },
  head: () => ({ meta: [{ title: "Exam Categories — Admin — Prepora" }] }),
  component: AdminExamTypesPage,
});

// Exam categories (the exam_types table) are managed only here — nothing seeds them. They drive
// the category tabs on the public /exams directory, so adding or removing one here shows up there
// straight away.
function AdminExamTypesPage() {
  const queryClient = useQueryClient();
  const { data: types = [], isLoading } = useQuery(orpc.admin.listExamTypes.queryOptions());
  const { mutateAsync: createExamType, isPending: isCreating } = useMutation(
    orpc.admin.createExamType.mutationOptions(),
  );
  const { mutateAsync: deleteExamType } = useMutation(orpc.admin.deleteExamType.mutationOptions());

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [hasProgramHierarchy, setHasProgramHierarchy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.admin.listExamTypes.queryKey() }),
      queryClient.invalidateQueries({ queryKey: orpc.exams.listTypes.queryKey() }),
    ]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const created = await createExamType({
        label: label.trim(),
        description: description.trim() || undefined,
        hasProgramHierarchy,
      });
      setLabel("");
      setDescription("");
      setHasProgramHierarchy(false);
      setMessage({ ok: true, text: `Added "${created.label}".` });
      await refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: (err instanceof Error ? err.message : undefined) || "Could not add the category.",
      });
    }
  };

  const handleDelete = async (id: string, typeLabel: string) => {
    if (!confirm(`Remove the "${typeLabel}" category?`)) return;
    setMessage(null);
    setDeletingId(id);
    try {
      await deleteExamType({ id });
      setMessage({ ok: true, text: `Removed "${typeLabel}".` });
      await refresh();
    } catch (err) {
      setMessage({
        ok: false,
        text: (err instanceof Error ? err.message : undefined) || "Could not remove the category.",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      <div className="px-6 pt-10 max-w-[1000px] mx-auto">
        <Link
          to="/admin"
          className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO ADMIN
        </Link>

        <div className="mt-10 mb-10 border-b border-slate-900 pb-8">
          <h1 className="text-3xl font-light text-white uppercase tracking-widest mb-2">
            Exam Categories
          </h1>
          <p className="font-mono text-xs text-slate-500 tracking-wide">
            The categories exams are grouped under, shown as tabs on the public exam directory.
          </p>
        </div>

        <form
          onSubmit={handleCreate}
          className="border border-slate-800 bg-slate-950/40 p-6 mb-10 space-y-4"
        >
          <h2 className="font-mono text-xs text-sky-400 uppercase tracking-widest">
            Add a category
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                Name
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Banking"
                required
                minLength={2}
                maxLength={60}
                className="bg-transparent border border-slate-700 focus:border-slate-400 outline-none px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                Description (optional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                className="bg-transparent border border-slate-700 focus:border-slate-400 outline-none px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={hasProgramHierarchy}
              onChange={(e) => setHasProgramHierarchy(e.target.checked)}
            />
            Exams in this category are organised by programme/course (like university or school
            exams)
          </label>
          <button
            type="submit"
            disabled={isCreating || label.trim().length < 2}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-mono text-xs uppercase tracking-wider flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> {isCreating ? "Adding…" : "Add category"}
          </button>
        </form>

        {message && (
          <div
            className={`mb-6 p-3 border font-mono text-xs ${
              message.ok
                ? "border-emerald-800 bg-emerald-950/30 text-emerald-300"
                : "border-rose-900 bg-rose-950/30 text-rose-300"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="border-t border-slate-900">
          {isLoading ? (
            <p className="font-mono text-xs text-slate-500 py-10 text-center">Loading…</p>
          ) : types.length === 0 ? (
            <p className="font-mono text-xs text-slate-500 py-10 text-center">No categories yet.</p>
          ) : (
            types.map((type) => {
              const blockedReason =
                type.examCount > 0
                  ? `Used by ${type.examCount} exam(s) — move or remove them first.`
                  : null;
              return (
                <div
                  key={type.id}
                  className="flex items-center justify-between gap-6 py-4 border-b border-slate-900"
                >
                  <div className="min-w-0">
                    <div className="text-white">{type.label}</div>
                    <div className="font-mono text-[10px] text-slate-500 uppercase tracking-widest mt-1">
                      {type.slug} · {type.examCount} exam{type.examCount === 1 ? "" : "s"}
                      {type.hasProgramHierarchy ? " · programme hierarchy" : ""}
                    </div>
                    {type.description && (
                      <div className="text-xs text-slate-400 mt-1">{type.description}</div>
                    )}
                  </div>
                  {blockedReason ? (
                    <span
                      title={blockedReason}
                      className="shrink-0 flex items-center gap-1.5 font-mono text-[10px] text-slate-500 uppercase tracking-widest"
                    >
                      <Lock className="w-3.5 h-3.5" /> In use
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDelete(type.id, type.label)}
                      disabled={deletingId === type.id}
                      className="shrink-0 px-3 py-1.5 border border-rose-900/80 bg-rose-950/40 hover:bg-rose-900 text-rose-300 font-mono text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingId === type.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

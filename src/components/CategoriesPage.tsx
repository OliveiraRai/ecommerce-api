import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
  getCategories,
  updateCategory,
  updateSubcategory,
  type Category,
  type Subcategory,
} from "../api/categories";
import { PageHeader } from "./PageHeader";

type Editing =
  | { kind: "category"; category: Category }
  | { kind: "subcategory"; subcategory: Subcategory }
  | null;

function errorMessage(cause: unknown, action: string) {
  if (cause instanceof ApiError) {
    if (cause.status === 401 || cause.status === 403)
      return "Você não tem permissão para esta operação.";
    if (cause.status === 404)
      return "A categoria ou subcategoria não foi encontrada. Atualize a lista e tente novamente.";
    if (cause.status === 409) {
      if (action === "excluir a categoria")
        return "Não é possível excluir esta categoria porque ela ainda possui subcategorias.";
      if (action === "excluir a subcategoria")
        return "Não é possível excluir esta subcategoria porque ela está associada a produtos.";
      return "Já existe uma categoria com esse nome, ou uma subcategoria com esse nome nesta categoria.";
    }
    if (cause.status === 422)
      return "Informe um nome válido com até 120 caracteres.";
  }
  return `Não foi possível ${action}. Verifique a conexão e tente novamente.`;
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(signal?: AbortSignal) {
    setCategories(await getCategories(signal));
  }

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, "carregar as categorias"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function submitCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createCategory(String(data.get("category_name") ?? "").trim());
      await refresh();
      form.reset();
      setNotice("Categoria cadastrada com sucesso.");
    } catch (cause) {
      setError(errorMessage(cause, "cadastrar a categoria"));
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateSubcategory(
    event: FormEvent<HTMLFormElement>,
    categoryId: number,
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await createSubcategory(
        categoryId,
        String(data.get("subcategory_name") ?? "").trim(),
      );
      await refresh();
      form.reset();
      setNotice("Subcategoria cadastrada com sucesso.");
    } catch (cause) {
      setError(errorMessage(cause, "cadastrar a subcategoria"));
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy) return;
    const data = new FormData(event.currentTarget);
    const nome = String(data.get("name") ?? "").trim();
    const action =
      editing.kind === "category"
        ? "renomear a categoria"
        : "renomear a subcategoria";
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editing.kind === "category")
        await updateCategory(editing.category.id, nome);
      else await updateSubcategory(editing.subcategory.id, nome);
      await refresh();
      setEditing(null);
      setNotice(
        editing.kind === "category"
          ? "Categoria atualizada com sucesso."
          : "Subcategoria atualizada com sucesso.",
      );
    } catch (cause) {
      setError(errorMessage(cause, action));
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(category: Category) {
    if (!window.confirm(`Excluir a categoria “${category.nome}”?`)) return;
    setError("");
    setNotice("");
    try {
      await deleteCategory(category.id);
      await refresh();
      setNotice(`Categoria “${category.nome}” excluída com sucesso.`);
    } catch (cause) {
      setError(errorMessage(cause, "excluir a categoria"));
    }
  }

  async function removeSubcategory(subcategory: Subcategory) {
    if (!window.confirm(`Excluir a subcategoria “${subcategory.nome}”?`))
      return;
    setError("");
    setNotice("");
    try {
      await deleteSubcategory(subcategory.id);
      await refresh();
      setNotice(`Subcategoria “${subcategory.nome}” excluída com sucesso.`);
    } catch (cause) {
      setError(errorMessage(cause, "excluir a subcategoria"));
    }
  }

  return (
    <div className="dashboard-content">
      <PageHeader
        title="Categorias"
        description="Organize as categorias e subcategorias usadas pelos produtos."
      />
      {notice && (
        <p className="feedback success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}

      <section
        className="data-panel brand-create-panel"
        aria-label="Cadastrar categoria"
      >
        <form
          className="product-form"
          onSubmit={(event) => void submitCreateCategory(event)}
        >
          <label>
            Nome da categoria
            <input name="category_name" required maxLength={120} />
          </label>
          <button className="primary-action" disabled={busy}>
            {busy ? "Salvando…" : "Cadastrar categoria"}
          </button>
        </form>
      </section>

      <section
        className="category-list"
        aria-label="Categorias e subcategorias"
      >
        {loading ? (
          <div className="data-panel">
            <p className="panel-status" role="status">
              Carregando categorias…
            </p>
          </div>
        ) : categories.length === 0 ? (
          <div className="data-panel">
            <p className="panel-status">Nenhuma categoria cadastrada.</p>
          </div>
        ) : (
          categories.map((category) => (
            <article className="data-panel category-panel" key={category.id}>
              <div className="section-heading">
                <h2>{category.nome}</h2>
                <div className="row-actions">
                  <button
                    type="button"
                    aria-label={`Editar categoria ${category.nome}`}
                    onClick={() => {
                      setError("");
                      setEditing({ kind: "category", category });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="danger-action"
                    aria-label={`Excluir categoria ${category.nome}`}
                    onClick={() => void removeCategory(category)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
              <form
                className="product-form category-subcategory-form"
                onSubmit={(event) =>
                  void submitCreateSubcategory(event, category.id)
                }
              >
                <label>
                  Nova subcategoria
                  <input name="subcategory_name" required maxLength={120} />
                </label>
                <button className="primary-action" disabled={busy}>
                  {busy ? "Salvando…" : "Cadastrar subcategoria"}
                </button>
              </form>
              {category.subcategorias.length === 0 ? (
                <p className="panel-status">Nenhuma subcategoria.</p>
              ) : (
                <ul className="subcategory-list">
                  {category.subcategorias.map((subcategory) => (
                    <li key={subcategory.id}>
                      <span>{subcategory.nome}</span>
                      <div className="row-actions">
                        <button
                          type="button"
                          aria-label={`Editar subcategoria ${subcategory.nome}`}
                          onClick={() => {
                            setError("");
                            setEditing({ kind: "subcategory", subcategory });
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-action"
                          aria-label={`Excluir subcategoria ${subcategory.nome}`}
                          onClick={() => void removeSubcategory(subcategory)}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-edit-title"
          >
            <div className="section-heading">
              <h2 id="category-edit-title">
                Editar{" "}
                {editing.kind === "category" ? "categoria" : "subcategoria"}
              </h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setEditing(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <form
              className="product-form"
              onSubmit={(event) => void submitEdit(event)}
            >
              <label>
                Nome
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={
                    editing.kind === "category"
                      ? editing.category.nome
                      : editing.subcategory.nome
                  }
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </button>
                <button className="primary-action" disabled={busy}>
                  {busy ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

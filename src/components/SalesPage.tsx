import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { getSale, getSales, type Sale } from "../api/sales";
import { PageHeader } from "./PageHeader";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});
const total = (sale: Sale) =>
  sale.itens.reduce(
    (sum, item) => sum + item.quantidade * Number(item.preco_unitario),
    0,
  );
const saleDate = (sale: Sale) =>
  sale.data_venda ? dateTime.format(new Date(sale.data_venda)) : "Data não registrada";
const queryError = (cause: unknown) =>
  cause instanceof ApiError && cause.status === 403
    ? "Você não tem permissão para consultar as vendas."
    : "Não foi possível carregar as vendas. Verifique sua conexão e tente novamente.";

export function SalesPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getSales(controller.signal)
      .then(setSales)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(queryError(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function showDetails(sale: Sale) {
    setError("");
    try {
      setSelected(await getSale(sale.id));
    } catch (cause) {
      setError(queryError(cause));
    }
  }

  return (
    <div className="dashboard-content">
      <PageHeader
        title="Vendas"
        description="Consulte as vendas registradas e os valores históricos dos itens."
      />
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      <section className="data-panel" aria-label="Lista de vendas">
        {loading ? (
          <p className="panel-status" role="status">
            Carregando vendas…
          </p>
        ) : error && sales.length === 0 ? null : sales.length === 0 ? (
          <p className="panel-status">Nenhuma venda registrada.</p>
        ) : (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Venda</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th>Total histórico</th>
                  <th>Data</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>#{sale.id}</td>
                    <td>Cliente #{sale.cliente_id}</td>
                    <td>
                      {sale.itens.reduce(
                        (sum, item) => sum + item.quantidade,
                        0,
                      )}
                    </td>
                    <td>{money.format(total(sale))}</td>
                    <td>{saleDate(sale)}</td>
                    <td>
                      <button onClick={() => void showDetails(sale)}>
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="form-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-detail-title"
          >
            <div className="section-heading">
              <div>
                <h2 id="sale-detail-title">Venda #{selected.id}</h2>
                <p>Cliente #{selected.cliente_id} · {saleDate(selected)}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="responsive-table">
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Preço histórico</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.itens.map((item) => (
                    <tr key={item.id}>
                      <td>Produto #{item.produto_id}</td>
                      <td>{item.quantidade}</td>
                      <td>{money.format(Number(item.preco_unitario))}</td>
                      <td>
                        {money.format(
                          item.quantidade * Number(item.preco_unitario),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sale-total">
              Total calculado pelos preços históricos:{" "}
              <strong>{money.format(total(selected))}</strong>
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

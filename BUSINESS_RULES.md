# Regras de negócio

- A aplicação representa uma única loja.
- `Vendedor` representa essa única loja; não existem múltiplos vendedores independentes no domínio atual.
- A loja pode possuir vários produtos, e cada produto pertence à loja.
- Preço e estoque pertencem ao produto.
- Um cliente pode possuir vários endereços; cada endereço pertence a um cliente.
- Um cliente pode realizar várias vendas; cada venda pertence a um cliente.
- Uma venda válida possui pelo menos um item.
- Cada item pertence a uma venda e referencia um produto.
- Cada item registra o preço praticado no momento da venda.
- Alterações posteriores no preço do produto não alteram o preço histórico do item vendido.
- O histórico das vendas não pode ser destruído por alterações ou exclusões de dados atuais.

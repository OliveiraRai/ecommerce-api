# Regras de negócio

- A aplicação representa uma única loja.
- `Vendedor` representa essa única loja; não existem múltiplos vendedores independentes no domínio atual.
- A loja pode possuir vários produtos, e cada produto pertence à loja.
- Preço e estoque pertencem ao produto.
- Um cliente pode possuir vários endereços; cada endereço pertence a um cliente.
- Um cliente pode realizar várias vendas; cada venda pertence a um cliente.
- Cliente possui nome, sobrenome, email e hash de senha obrigatórios; o email é único sem distinção entre maiúsculas e minúsculas.
- A senha original e a confirmação de senha não são persistidas.
- Senhas de clientes exigem no mínimo 12 caracteres, letra maiúscula, letra minúscula e caractere especial (qualquer caractere fora de ASCII alfanumérico).
- A autenticação de clientes não concede privilégios administrativos; mutações do catálogo são exclusivas do administrador.
- Uma venda válida possui pelo menos um item.
- Cada item pertence a uma venda e referencia um produto.
- Cada item registra o preço praticado no momento da venda.
- Alterações posteriores no preço do produto não alteram o preço histórico do item vendido.
- O faturamento exibido no painel administrativo é a soma de quantidade × preço unitário histórico de todos os itens de todas as vendas; não representa necessariamente dinheiro recebido, pois o sistema ainda não possui estados de pagamento ou cancelamento.
- O histórico das vendas não pode ser destruído por alterações ou exclusões de dados atuais.

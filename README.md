# Escritório Digital · Castles Bay

Um escritório digital para gerir a comunicação das marcas da Castles Bay.
Funciona inteiramente no browser — sem servidor, sem instalações, sem contas.
Os dados ficam guardados no teu próprio browser (`localStorage`).

## Os três espaços

- **📅 Calendário** — aponta os posts a fazer num calendário mensal. Cada post
  tem título, data, categoria, estado (*Planeado* / *Publicado*) e notas/legenda.
  Clica num dia para adicionar; clica num post para editar.
- **💡 Ideias** — um mural para apontar ideias de posts e de comunicação.
- **✅ Tarefas** — a tua lista de tarefas, com checkbox para marcar como concluídas.

## Categorias partilhadas

Crias categorias com **nome + cor** (botão `＋` ao lado de "Categorias").
As categorias aparecem nos três espaços: podes categorizar posts, ideias e
tarefas, e usar o filtro no topo (ou clicar numa categoria na barra lateral)
para ver apenas o que interessa.

## Cópias de segurança

- **Exportar** — descarrega um ficheiro `.json` com tudo.
- **Importar** — restaura a partir de um ficheiro exportado.

Como os dados vivem no browser, exporta de vez em quando (e antes de mudar de
computador ou limpar o histórico do browser).

## Como usar

Abre o `index.html` no browser. Basta um duplo-clique no ficheiro, ou publica
a pasta em qualquer alojamento estático (ex.: GitHub Pages) e acede pelo link.

## Ficheiros

- `index.html` — estrutura da página
- `styles.css` — aspeto visual (tema claro e escuro automáticos)
- `app.js` — toda a lógica (sem dependências externas)

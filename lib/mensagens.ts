export const CHAVE_MENSAGEM_PENDENTE = "jj-mensagem-pendente";

export interface MensagemSemana {
  frase1: string;
  frase2: string;
}

export const MENSAGENS_SEMANA: MensagemSemana[] = [
  { frase1: "Toda grande venda começa com uma conversa simples.", frase2: "Faça o básico bem feito hoje e os resultados aparecerão." },
  { frase1: "O cliente percebe quando você acredita no que oferece.", frase2: "Mostre o valor da sua solução e deixe a confiança fazer o resto." },
  { frase1: "Um não de hoje pode abrir a porta de amanhã.", frase2: "Mantenha o ritmo e aprenda com cada atendimento." },
  { frase1: "Quem acompanha seus números toma decisões melhores.", frase2: "Revise sua meta, ajuste a rota e siga em frente." },
  { frase1: "Vender é resolver problemas com atenção.", frase2: "Ouça mais, entenda a necessidade e apresente a solução certa." },
  { frase1: "A constância vence o entusiasmo passageiro.", frase2: "Um atendimento a mais por dia constrói resultados maiores." },
  { frase1: "Cada categoria é uma nova chance de subir no ranking.", frase2: "Foque no que você controla e faça o próximo contato." },
  { frase1: "Confiança se constrói no detalhe.", frase2: "Cumpra o que prometeu e o cliente voltará a comprar com você." },
  { frase1: "Não espere o momento perfeito para agir.", frase2: "Comece pelo próximo cliente e transforme esforço em resultado." },
  { frase1: "Sua energia contagia o atendimento.", frase2: "Chegue com disposição, escute com atenção e feche com clareza." },
  { frase1: "Metas grandes são feitas de pequenas ações repetidas.", frase2: "Organize sua semana e comemore cada avanço." },
  { frase1: "O resultado de hoje é reflexo da preparação de ontem.", frase2: "Estude sua categoria e chegue pronto para vender." },
  { frase1: "Toda equipe forte cresce junto.", frase2: "Compartilhe o que funciona e ajude quem está ao seu lado a evoluir." }
];

export function numeroSemanaISO(data: Date): number {
  const dia = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaDaSemana = dia.getUTCDay() || 7;
  dia.setUTCDate(dia.getUTCDate() + 4 - diaDaSemana);
  const inicioDoAno = new Date(Date.UTC(dia.getUTCFullYear(), 0, 1));
  return Math.ceil((((dia.getTime() - inicioDoAno.getTime()) / 86400000) + 1) / 7);
}

export function mensagemDaSemana(data = new Date()): MensagemSemana {
  const indice = (numeroSemanaISO(data) - 1) % MENSAGENS_SEMANA.length;
  return MENSAGENS_SEMANA[indice];
}

export function buildGmailSearchQuery(options: {
  domains: string[];
  daysBack: number;
}): string {
  const { domains, daysBack } = options;

  if (domains.length === 0) return "";

  const fromClause = domains.map((d) => `from:${d}`).join(" OR ");
  const subjectKeywords =
    "(subject:quote OR subject:pricing OR subject:estimate OR subject:RFQ)";
  const contentClause = `(has:attachment OR ${subjectKeywords})`;
  const timeClause = `newer_than:${daysBack}d`;

  return `(${fromClause}) AND ${contentClause} AND ${timeClause}`;
}

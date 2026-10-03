import { defineField, defineType } from 'sanity';

/**
 * Sanity Context configuration document. Publishing one of these produces a
 * stable MCP endpoint at
 *   https://api.sanity.io/v<apiVersion>/context/mcp/<projectId>/<dataset>/<slug>
 * The groqFilter is the agent's read boundary, so it is a schema concern rather
 * than a query concern.
 */
export const agentContext = defineType({
  name: 'sanity.agentContext',
  title: 'Agent context',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description: 'Short and stable, for example adjudication-desk.',
      options: { source: 'name' },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'groqFilter',
      title: 'GROQ filter',
      type: 'text',
      rows: 3,
      description:
        'A filter expression, not a full query. Defaults to _type in ["dispute", "entity"].',
      initialValue: '_type in ["dispute", "entity"]',
    }),
    defineField({
      name: 'instructions',
      title: 'Instructions',
      type: 'text',
      rows: 10,
      description: 'How the agent should query and present this content.',
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'slug.current' },
  },
});
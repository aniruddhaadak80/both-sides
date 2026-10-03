import { defineField, defineType } from 'sanity';

export const entity = defineType({
  name: 'entity',
  title: 'Entity',
  type: 'document',
  fields: [
    defineField({
      name: 'entityId',
      title: 'Entity id',
      type: 'string',
      description: 'Wikidata QID, for example Q35765.',
      validation: (rule) => rule.required().regex(/^Q\d+$/, { name: 'QID' }),
    }),
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      validation: (rule) => rule.required().max(120),
    }),
    defineField({ name: 'description', title: 'Description', type: 'text', rows: 2 }),
    defineField({
      name: 'wikipedia',
      title: 'Wikipedia',
      type: 'object',
      fields: [
        defineField({ name: 'title', type: 'string' }),
        defineField({ name: 'extract', type: 'text', rows: 3 }),
        defineField({ name: 'timestamp', type: 'string' }),
        defineField({ name: 'url', type: 'url' }),
      ],
    }),
    defineField({
      name: 'openstreetmap',
      title: 'OpenStreetMap',
      type: 'object',
      fields: [
        defineField({ name: 'osmType', type: 'string' }),
        defineField({ name: 'osmId', type: 'number' }),
        defineField({ name: 'displayName', type: 'string' }),
        defineField({ name: 'lat', type: 'string' }),
        defineField({ name: 'lon', type: 'string' }),
        defineField({ name: 'elevation', type: 'number' }),
      ],
    }),
  ],
  preview: {
    select: { title: 'label', subtitle: 'entityId' },
  },
});
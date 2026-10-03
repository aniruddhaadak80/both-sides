import { defineArrayMember, defineField, defineType } from 'sanity';

export const dispute = defineType({
  name: 'dispute',
  title: 'Dispute',
  type: 'document',
  fields: [
    defineField({
      name: 'entity',
      title: 'Entity',
      type: 'reference',
      to: [{ type: 'entity' }],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'entityId',
      title: 'Entity id',
      type: 'string',
      description: 'Denormalised QID so GROQ can filter without dereferencing.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'entityLabel',
      title: 'Entity label',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'propertyId',
      title: 'Property id',
      type: 'string',
      description: 'Wikidata property, for example P1082 for population.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'propertyKey',
      title: 'Property key',
      type: 'string',
      description: 'Stable machine key, for example population.',
    }),
    defineField({
      name: 'propertyLabel',
      title: 'Property label',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'claims',
      title: 'Competing claims',
      type: 'array',
      description:
        'Every published claim for this property. A dispute exists only when these disagree, so this array must hold at least two entries with different values.',
      of: [defineArrayMember({ type: 'claim' })],
      validation: (rule) => rule.required().min(2),
    }),
  ],
  preview: {
    select: { title: 'entityLabel', property: 'propertyLabel', count: 'claims' },
    prepare({ title, property }) {
      return { title: `${title ?? 'Entity'} · ${property ?? 'Property'}` };
    },
  },
});
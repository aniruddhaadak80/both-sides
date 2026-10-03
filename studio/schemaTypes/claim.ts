import { defineArrayMember, defineField, defineType } from 'sanity';

export const claim = defineType({
  name: 'claim',
  title: 'Claim',
  type: 'object',
  fields: [
    defineField({
      name: 'claimId',
      title: 'Claim id',
      type: 'string',
      description: 'Stable upstream identifier, for example Q35765-P1082-2.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'value',
      title: 'Value as published',
      type: 'string',
      description: 'The literal value the source states, kept verbatim for display.',
      validation: (rule) => rule.required().max(200),
    }),
    defineField({
      name: 'numeric',
      title: 'Numeric value',
      type: 'number',
      description: 'Parsed number used for comparison and corroboration. Null when the value is not numeric.',
    }),
    defineField({
      name: 'rank',
      title: 'Upstream rank',
      type: 'string',
      options: {
        list: [
          { title: 'Preferred', value: 'preferred' },
          { title: 'Normal', value: 'normal' },
          { title: 'Deprecated', value: 'deprecated' },
        ],
        layout: 'radio',
      },
      initialValue: 'normal',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'referenceCount',
      title: 'Reference count',
      type: 'number',
      description: 'How many independent references the upstream record attaches.',
      initialValue: 0,
    }),
    defineField({
      name: 'referenceUrls',
      title: 'Reference URLs',
      type: 'array',
      of: [defineArrayMember({ type: 'url' })],
    }),
    defineField({
      name: 'retrieved',
      title: 'Retrieved on',
      type: 'date',
      description: 'When the supporting reference was last retrieved upstream.',
    }),
    defineField({
      name: 'precision',
      title: 'Precision',
      type: 'string',
      description: 'How exact the statement is, for example "quantity" or "year precision 8".',
    }),
  ],
  preview: {
    select: { title: 'value', subtitle: 'rank' },
  },
});
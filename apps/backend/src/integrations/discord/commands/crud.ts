/**
 * commands/crud.ts — `/crud` slash command for admin CRUD.
 *
 * Single Discord command that exposes CRUD across every entity the
 * bot can manage. Built with Discord subcommand groups so admins can
 * type `/crud <entity> <op> ...` (e.g. `/crud faqs list page:2`).
 *
 * Layout (3 entity groups × 5 ops = 15 subcommands):
 *   faqs      list [page], view <id>, create, update <id>, delete <id>
 *   web-pages list [page], view <id>, create, update <id>, delete <id>
 *   documents list [page], view <id>, create, update <id>, delete <id>
 *
 * Why one command + groups (instead of one command per entity):
 *   - Discord's 25-subcommand-per-group cap would force us to split
 *     entities into multiple commands as the list grows. Groups
 *     inside one command are cleaner and easier to extend.
 *   - The handler layer (`admin/adminCrud.ts`) is already entity-
 *     generic; this layer just routes.
 *
 * Create / update still emit ephemeral "send me the fields" messages;
 * modals are a follow-up. List / view / delete use real API calls.
 *
 * Auth: gated on `isAdmin()` (same pattern as `/admin`).
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js';
import type { BotConfig } from '../discordBot.js';
import { isAdmin } from '../events/interactionCreate.js';
import {
  faqList,
  faqView,
  faqCreate,
  faqUpdate,
  faqDelete,
  webPageList,
  webPageView,
  webPageCreate,
  webPageUpdate,
  webPageDelete,
  documentList,
  documentView,
  documentCreate,
  documentUpdate,
  documentDelete,
  type AdminCrudResult,
} from '../admin/adminCrud.js';

type EntityKey = 'faqs' | 'web-pages' | 'documents';
type OpKey = 'list' | 'view' | 'create' | 'update' | 'delete';

const ENTITIES: EntityKey[] = ['faqs', 'web-pages', 'documents'];
const OPS: OpKey[] = ['list', 'view', 'create', 'update', 'delete'];

/** Dispatch table — `adminCrud.ts` exports one fn per (entity, op). */
const HANDLERS: Record<EntityKey, Record<OpKey, (args: { id?: string; page?: number }) => Promise<AdminCrudResult>>> = {
  faqs: {
    list:   ({ page })    => faqList(page ?? 1),
    view:   ({ id })      => { if (!id) throw new Error('view requires <id>'); return faqView(id); },
    create: ()            => faqCreate(),
    update: ({ id })      => { if (!id) throw new Error('update requires <id>'); return faqUpdate(id); },
    delete: ({ id })      => { if (!id) throw new Error('delete requires <id>'); return faqDelete(id); },
  },
  'web-pages': {
    list:   ({ page })    => webPageList(page ?? 1),
    view:   ({ id })      => { if (!id) throw new Error('view requires <id>'); return webPageView(id); },
    create: ()            => webPageCreate(),
    update: ({ id })      => { if (!id) throw new Error('update requires <id>'); return webPageUpdate(id); },
    delete: ({ id })      => { if (!id) throw new Error('delete requires <id>'); return webPageDelete(id); },
  },
  documents: {
    list:   ({ page })    => documentList(page ?? 1),
    view:   ({ id })      => { if (!id) throw new Error('view requires <id>'); return documentView(id); },
    create: ()            => documentCreate(),
    update: ({ id })      => { if (!id) throw new Error('update requires <id>'); return documentUpdate(id); },
    delete: ({ id })      => { if (!id) throw new Error('delete requires <id>'); return documentDelete(id); },
  },
};

/**
 * Build the SlashCommandBuilder declaratively. Each entity is a
 * subcommand *group* containing five subcommands. We add the `id`
 * and `page` options only on the subcommands that need them.
 */
export const crudCommandData = (() => {
  const builder = new SlashCommandBuilder()
    .setName('crud')
    .setDescription('[admin] CRUD on FAQs, web pages, and documents')
    .setDefaultMemberPermissions(0); // server-side double-check via isAdmin

  for (const entity of ENTITIES) {
    // Subcommand group per entity.
    builder.addSubcommandGroup((group) => {
      group.setName(entity).setDescription(`CRUD for ${entity}`);
      for (const op of OPS) {
        group.addSubcommand((sub) => {
          sub.setName(op).setDescription(`${op} ${entity}`);
          if (op === 'view' || op === 'update' || op === 'delete') {
            sub.addStringOption((o) =>
              o.setName('id')
                .setDescription('Entity id (Mongo ObjectId)')
                .setRequired(true),
            );
          }
          if (op === 'list') {
            sub.addIntegerOption((o) =>
              o.setName('page')
                .setDescription('Page number (default 1)')
                .setMinValue(1)
                .setMaxValue(1000),
            );
          }
          return sub;
        });
      }
      return group;
    });
  }

  return builder.toJSON();
})();

/** Reply helper — handles both `embeds` and `ephemeral` result shapes. */
async function replyResult(
  interaction: ChatInputCommandInteraction,
  result: AdminCrudResult,
): Promise<void> {
  if ('ephemeral' in result && result.ephemeral) {
    await interaction.reply({ content: result.ephemeral, ephemeral: true });
    return;
  }
  await interaction.reply({
    embeds: (result.embeds ?? []).length
      ? result.embeds
      : [new EmbedBuilder().setColor(0x4a7c59).setTitle('✅ done')],
    ephemeral: true,
  });
}

export async function executeCrud(
  interaction: ChatInputCommandInteraction,
  config: BotConfig,
  _batchId: string | null = null,
): Promise<void> {
  if (!isAdmin(interaction, config)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Admin only')
        .setDescription('This command is restricted to configured admins.')],
      ephemeral: true,
    });
    return;
  }

  // With subcommand groups, Discord gives us both names directly.
  const entity = interaction.options.getSubcommandGroup() as EntityKey;
  const op = interaction.options.getSubcommand() as OpKey;

  if (!ENTITIES.includes(entity) || !OPS.includes(op)) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('Unknown subcommand')
        .setDescription(`\`/crud ${entity} ${op}\` isn't registered.`)],
      ephemeral: true,
    });
    return;
  }

  const id = interaction.options.getString('id') ?? undefined;
  const page = interaction.options.getInteger('page') ?? undefined;

  try {
    const handler = HANDLERS[entity][op];
    const result = await handler({ id, page });
    await replyResult(interaction, result);
  } catch (err) {
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle('CRUD handler failed')
        .setDescription(`\`${(err as Error).message}\``)],
      ephemeral: true,
    });
  }
}
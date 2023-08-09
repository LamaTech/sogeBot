import { error } from 'console';

import { defaults, isNil } from 'lodash';

import { getChannelInformation } from './getChannelInformation';
import { getGameIdFromName } from './getGameIdFromName';

import {
  gameCache, gameOrTitleChangedManually, rawStatus, stats, tagsCache,
} from '~/helpers/api';
import { parseTitle } from '~/helpers/api/parseTitle';
import { CONTENT_CLASSIFICATION_LABELS } from '~/helpers/constants';
import { isDebugEnabled } from '~/helpers/debug';
import { eventEmitter } from '~/helpers/events/emitter';
import { getFunctionName } from '~/helpers/getFunctionName';
import { debug, warning } from '~/helpers/log';
import { addUIError } from '~/helpers/panel/index';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';
import twitch from '~/services/twitch';
import { translate } from '~/translate';
import { variables } from '~/watchers';

async function updateChannelInfo (args: { title?: string | null; game?: string | null, tags?: string[], contentClassificationLabels?: string[] }): Promise<{ response: string; status: boolean } | null> {
  if (isDebugEnabled('api.calls')) {
    debug('api.calls', new Error().stack);
  }
  args = defaults(args, { title: null }, { game: null });
  const cid = variables.get('services.twitch.broadcasterId') as string;
  const broadcasterCurrentScopes = variables.get('services.twitch.broadcasterCurrentScopes') as string[];

  if (!broadcasterCurrentScopes.includes('channel_editor')) {
    warning('Missing Broadcaster oAuth scope channel_editor to change game or title. This mean you can have inconsistent game set across Twitch: https://github.com/twitchdev/issues/issues/224');
    addUIError({ name: 'OAUTH', message: 'Missing Broadcaster oAuth scope channel_editor to change game or title. This mean you can have inconsistent game set across Twitch: <a href="https://github.com/twitchdev/issues/issues/224">Twitch Issue # 224</a>' });
  }
  if (!broadcasterCurrentScopes.includes('user:edit:broadcast')) {
    warning('Missing Broadcaster oAuth scope user:edit:broadcast to change game or title');
    addUIError({ name: 'OAUTH', message: 'Missing Broadcaster oAuth scope user:edit:broadcast to change game or title' });
    return { response: '', status: false };
  }

  let title: string;
  let game;
  let tags: string[];

  try {
    if (!isNil(args.title)) {
      rawStatus.value = args.title; // save raw status to cache, if changing title
    }
    title = await parseTitle(rawStatus.value);

    if (!isNil(args.game)) {
      game = args.game;
      gameCache.value = args.game; // save game to cache, if changing game
    } else {
      game = gameCache.value;
    } // we are not setting game -> load last game

    if (!isNil(args.tags)) {
      tags = args.tags;
      tagsCache.value = JSON.stringify(args.tags); // save tags to cache, if changing tags
    } else {
      tags = JSON.parse(tagsCache.value) as string[];
    } // we are not setting game -> load last game

    if (!isNil(args.tags)) {
      tags = args.tags;
      tagsCache.value = JSON.stringify(args.tags); // save tags to cache, if changing tags
    } else {
      tags = JSON.parse(tagsCache.value) as string[];
    } // we are not setting game -> load last game

    const gameId = await getGameIdFromName(game);

    let content_classification_labels: {id: string, is_enabled: boolean}[] | undefined = undefined;
    //  if content classification is present, do a change, otherwise we are not changing anything
    if (args.contentClassificationLabels) {
      content_classification_labels = [];
      for (const id of Object.keys(CONTENT_CLASSIFICATION_LABELS)) {
        if (id === 'MatureGame') {
          continue; // set automatically
        }
        content_classification_labels.push({ id, is_enabled: args.contentClassificationLabels.includes(id) });
      }
    }

    await twitch.apiClient?.asIntent(['broadcaster'], ctx => ctx.channels.updateChannelInfo(cid, {
      title: title ? title : undefined, gameId, tags, content_classification_labels,
    }));
    await getChannelInformation({});
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('ETIMEDOUT')) {
        warning(`${getFunctionName()} => Connection to Twitch timed out. Will retry request.`);
        await setImmediateAwait();
        return updateChannelInfo(args);
      } else {
        error(`${getFunctionName()} => ${e.stack ?? e.message}`);
      }
    }
    return { response: '', status: false };
  }

  const responses: { response: string; status: boolean } = { response: '', status: false };

  if (!isNil(args.game)) {
    responses.response = translate('game.change.success').replace(/\$game/g, args.game);
    responses.status = true;
    if (stats.value.currentGame !== args.game) {
      eventEmitter.emit('game-changed', { oldGame: stats.value.currentGame ?? 'n/a', game: args.game });
    }
    stats.value.currentGame = args.game;
  }

  if (!isNil(args.title)) {
    responses.response = translate('title.change.success').replace(/\$title/g, args.title);
    responses.status = true;
    stats.value.currentTitle = args.title;
  }

  if (!isNil(args.tags)) {
    stats.value.currentTags = args.tags;
  }
  gameOrTitleChangedManually.value = true;
  return responses;
}

export { updateChannelInfo };
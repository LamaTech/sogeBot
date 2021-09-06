import { MINUTE } from '@sogebot/ui-helpers/constants';
import {
  getRepository, In, MoreThanOrEqual,
} from 'typeorm';

import currency from '../../currency';
import { EventList } from '../../database/entity/eventList';
import { Goal, GoalInterface } from '../../database/entity/goal';
import { UserBit, UserTip } from '../../database/entity/user';
import { mainCurrency } from '../currency';
import { isBotStarted } from '../database';

export const types = ['bits', 'tips', 'followers', 'subscribers'] as const;

export async function recountIntervals(type: typeof types[number]) {
  const items = (await getRepository(Goal).find({ type: 'interval' + type.charAt(0).toUpperCase() + type.slice(1) as GoalInterface['type'] }))
    .filter(item => {
      return item.endAfterIgnore || item.endAfter > Date.now();
    });

  for (const item of items) {
    if (item.type === 'intervalBits') {
      const events = await getRepository(UserBit).find({ cheeredAt: MoreThanOrEqual(Date.now() - item.interval) });
      await getRepository(Goal).save({
        ...item,
        currentAmount: events.reduce((prev, cur) => {
          return prev += cur.amount;
        }, 0),
      });
    } else if (item.type === 'intervalTips') {
      const events = await getRepository(UserTip).find({ tippedAt: MoreThanOrEqual(Date.now() - item.interval) });
      if (!item.countBitsAsTips) {
        await getRepository(Goal).save({
          ...item,
          currentAmount: events.reduce((prev, cur) => {
            return prev += cur.sortAmount;
          }, 0),
        });
      } else {
        const events2 = await getRepository(UserBit).find({ cheeredAt: MoreThanOrEqual(Date.now() - item.interval) });
        await getRepository(Goal).save({
          ...item,
          currentAmount: events.reduce((prev, cur) => {
            return prev += cur.sortAmount;
          }, 0) + events2.reduce((prev, cur) => {
            return prev += Number(currency.exchange(cur.amount / 100, 'USD', mainCurrency.value));
          }, 0),
        });
      }
    } else if (item.type === 'intervalFollowers') {
      await getRepository(Goal).save({
        ...item,
        currentAmount: await getRepository(EventList).count({
          timestamp: MoreThanOrEqual(Date.now() - item.interval),
          event:     'follow',
        }),
      });
    } else if (item.type === 'intervalSubscribers') {
      await getRepository(Goal).save({
        ...item,
        currentAmount: await getRepository(EventList).count({
          timestamp: MoreThanOrEqual(Date.now() - item.interval),
          event:     In(['sub', 'resub']),
        }),
      });
    }
  }
}

setInterval(async () => {
  if (isBotStarted) {
    for (const type of types) {
      await recountIntervals(type);
    }
  }
}, MINUTE);
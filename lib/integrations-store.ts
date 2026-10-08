import { makeFunctionReference } from 'convex/server';
import { convexClient,convexSecret } from './convex';
export function integrationQuery(name:string,args:Record<string,unknown>) {return convexClient().query(makeFunctionReference<'query'>(`integrations:${name}`),{secret:convexSecret(),...args});}
export function integrationMutation(name:string,args:Record<string,unknown>) {return convexClient().mutation(makeFunctionReference<'mutation'>(`integrations:${name}`),{secret:convexSecret(),...args});}

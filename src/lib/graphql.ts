import { ApolloServer } from '@apollo/server';
import { GraphQLError, type ValidationContext } from 'graphql';
import { DomainError } from './model';
import type { Service } from './service';
type Context = { service: Service; workspace: string; role: string };
export const contextFor = (service: Service, workspace: string, role: string): Context => ({
  service,
  workspace,
  role,
});
export function createApi() {
  return new ApolloServer<Context>({
    includeStacktraceInErrorResponses: false,
    typeDefs: `#graphql
 type Service { id:ID!,name:String!,description:String!,duration:Int!,price:Int! }
 type Provider {id:ID!,name:String!,role:String!,initials:String!}
 type Event {kind:String!,at:String!,detail:String!}
 type Appointment {id:ID!,serviceId:ID!,providerId:ID!,customer:String!,startsAt:String!,endsAt:String!,status:String!,version:Int!,createdAt:String!,events:[Event!]!}
 type Slot {startsAt:String!,available:Boolean!}
 type Dashboard {services:[Service!]!,providers:[Provider!]!,days:[String!]!,appointments:[Appointment!]!,storageMode:String!}
 type Query {dashboard:Dashboard!,slots(providerId:ID!,serviceId:ID!,day:String!):[Slot!]!}
 input BookingInput {serviceId:ID!,providerId:ID!,startsAt:String!,customer:String!,requestKey:String!}
 type Mutation {book(input:BookingInput!):Appointment!,change(id:ID!,version:Int!,startsAt:String):Appointment!}
`,
    validationRules: [
      (c: ValidationContext) => {
        let fields = 0;
        return {
          Field() {
            if (++fields === 151) c.reportError(new GraphQLError('Maximum 150 fields.'));
          },
          FragmentDefinition() {
            c.reportError(new GraphQLError('Fragments are disabled in this bounded demo.'));
          },
          OperationDefinition(n) {
            if (n.operation === 'mutation' && n.selectionSet.selections.length > 1)
              c.reportError(new GraphQLError('One mutation field per request.'));
          },
        };
      },
    ],
    resolvers: {
      Query: {
        dashboard: (_: unknown, __: unknown, c: Context) => c.service.dashboard(c.workspace),
        slots: (
          _: unknown,
          a: { providerId: string; serviceId: string; day: string },
          c: Context,
        ) => c.service.slots(c.workspace, a.providerId, a.serviceId, a.day),
      },
      Mutation: {
        book: (_: unknown, { input }: { input: unknown }, c: Context) =>
          c.service.book(c.workspace, c.role, input),
        change: (_: unknown, a: { id: string; version: number; startsAt?: string }, c: Context) =>
          c.service.change(c.workspace, c.role, a.id, a.version, a.startsAt ?? null),
      },
    },
    formatError: (formatted, error) => {
      const original = error instanceof GraphQLError ? error.originalError : null;
      if (original instanceof DomainError)
        return { message: original.message, extensions: { code: original.code } };
      if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        console.error(error);
        return {
          message: 'Unable to complete this operation.',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        };
      }
      return formatted;
    },
  });
}

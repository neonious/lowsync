import { PromptModule, Question, Questions } from 'inquirer';
import { Omit } from 'lodash';

let promptModule: PromptModule | undefined;

async function prompt<T>(questions: Questions) {
  promptModule =
    promptModule || (await import('inquirer')).createPromptModule();
  return await promptModule<T>(questions);
}
type QuestionSingle = Omit<Question, 'name'>;
async function promptSingle<T>(question: QuestionSingle) {
  const { value } = await prompt<{ value: T }>({
    ...question,
    name: 'value'
  });
  return value;
}

interface BoolQuestion extends BaseQuestion<boolean> {}
export function promptBool(question: BoolQuestion) {
  return promptSingle<boolean>({
    ...question,
    type: 'confirm'
  });
}

interface BaseQuestion<T> extends Omit<Question, 'name' | 'type'> {
  message: string;
  default?: T;
}

interface ListQuestion<T> extends BaseQuestion<T> {
  choices: { name: string; value: T }[];
}

export function promptList<T extends string>(question: ListQuestion<T>) {
  return promptSingle<T>({
    ...question,
    type: 'list'
  });
}
interface StringQuestion extends BaseQuestion<string> {
  isPassword?: boolean;
}
export function promptString(question: StringQuestion) {
  const { isPassword, ...rest } = question;
  return promptSingle<string>({
    ...rest,
    type: isPassword ? 'password' : 'input'
  });
}
interface ConfirmOptions {
  answer?: boolean;
  defaultAnswer?: boolean;
  message: string;
}

export async function confirmOrDefault({
  answer,
  defaultAnswer,
  message
}: ConfirmOptions) {
  if (answer !== undefined) {
    return answer;
  }
  return await promptBool({
    message,
    default: defaultAnswer
  });
}

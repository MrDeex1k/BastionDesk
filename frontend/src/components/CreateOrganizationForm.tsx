import { useCallback, useReducer } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  KeyRound,
  User,
  ArrowLeft,
  Building2,
  Link2,
  Image as ImageIcon,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { organization } from "@/lib/auth-client";
import { apiFetch, readJsonError } from "@/lib/api";
import {
  validateEmail,
  validateFullName,
  validateOrganizationSlug,
  validatePassword,
} from "@/lib/validation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";

interface CreateOrganizationFormProps {
  onBack: () => void;
  onRegisterSuccess: () => void;
}

interface CreateOrganizationFormState {
  email: string;
  password: string;
  fullName: string;
  orgName: string;
  orgSlug: string;
  logoUrl: string;
  emailError: string;
  passwordError: string;
  fullNameError: string;
  orgNameError: string;
  orgSlugError: string;
}

interface CreateOrganizationResponse {
  organization?: {
    id?: string;
  };
}

type CreateOrganizationFormField =
  | "email"
  | "password"
  | "fullName"
  | "orgName"
  | "orgSlug"
  | "logoUrl";

type CreateOrganizationFormErrorField =
  | "emailError"
  | "passwordError"
  | "fullNameError"
  | "orgNameError"
  | "orgSlugError";

interface CreateOrganizationFieldConfig {
  field: CreateOrganizationFormField;
  icon: LucideIcon;
  id: string;
  label: string;
  placeholder: string;
  type: "email" | "password" | "text" | "url";
  errorField?: CreateOrganizationFormErrorField;
  required?: boolean;
}

type CreateOrganizationFormAction =
  | {
      type: "set-field";
      field: CreateOrganizationFormField;
      value: string;
    }
  | {
      type: "set-errors";
      errors: Pick<
        CreateOrganizationFormState,
        | "emailError"
        | "passwordError"
        | "fullNameError"
        | "orgNameError"
        | "orgSlugError"
      >;
    }
  | {
      type: "reset";
    };

const initialCreateOrganizationFormState: CreateOrganizationFormState = {
  email: "",
  password: "",
  fullName: "",
  orgName: "",
  orgSlug: "",
  logoUrl: "",
  emailError: "",
  passwordError: "",
  fullNameError: "",
  orgNameError: "",
  orgSlugError: "",
};

const FIELD_INPUT_CLASSNAME =
  "border-zinc-700 bg-zinc-900/50 pl-10 text-white placeholder:text-zinc-500 focus:border-purple-500 focus:ring-purple-500/20";

const ADMIN_FIELDS: CreateOrganizationFieldConfig[] = [
  {
    field: "fullName",
    icon: User,
    id: "fullName",
    label: "Imię i nazwisko",
    placeholder: "Jan Kowalski",
    type: "text",
    errorField: "fullNameError",
    required: true,
  },
  {
    field: "email",
    icon: Mail,
    id: "email",
    label: "Adres e-mail",
    placeholder: "twoj@email.com",
    type: "email",
    errorField: "emailError",
    required: true,
  },
  {
    field: "password",
    icon: KeyRound,
    id: "password",
    label: "Hasło",
    placeholder: "••••••••••••",
    type: "password",
    errorField: "passwordError",
    required: true,
  },
];

const ORGANIZATION_FIELDS: CreateOrganizationFieldConfig[] = [
  {
    field: "orgName",
    icon: Building2,
    id: "orgName",
    label: "Nazwa organizacji",
    placeholder: "Moja Firma Sp. z o.o.",
    type: "text",
    errorField: "orgNameError",
    required: true,
  },
  {
    field: "orgSlug",
    icon: Link2,
    id: "orgSlug",
    label: "Skrót organizacji (ID)",
    placeholder: "moja-firma",
    type: "text",
    errorField: "orgSlugError",
    required: true,
  },
  {
    field: "logoUrl",
    icon: ImageIcon,
    id: "logoUrl",
    label: "URL Loga organizacji (Opcjonalne)",
    placeholder: "https://example.com/logo.png",
    type: "url",
  },
];

function createOrganizationFormReducer(
  state: CreateOrganizationFormState,
  action: CreateOrganizationFormAction,
): CreateOrganizationFormState {
  switch (action.type) {
    case "set-field":
      return {
        ...state,
        [action.field]: action.value,
      };
    case "set-errors":
      return {
        ...state,
        ...action.errors,
      };
    case "reset":
      return initialCreateOrganizationFormState;
    default:
      return state;
  }
}

export function CreateOrganizationForm({
  onBack,
  onRegisterSuccess,
}: CreateOrganizationFormProps) {
  const [state, dispatch] = useReducer(
    createOrganizationFormReducer,
    initialCreateOrganizationFormState,
  );
  const queryClient = useQueryClient();

  const setField = useCallback(
    (field: CreateOrganizationFormField, value: string) => {
      dispatch({ type: "set-field", field, value });
    },
    [],
  );

  const validateForm = useCallback(() => {
    const nextEmailError = validateEmail(state.email);
    const nextPasswordError = validatePassword(state.password);
    const nextFullNameError = validateFullName(state.fullName);
    const nextOrgNameError = state.orgName.trim()
      ? ""
      : "Nazwa organizacji jest wymagana";
    const nextOrgSlugError = validateOrganizationSlug(state.orgSlug);

    dispatch({
      type: "set-errors",
      errors: {
        emailError: nextEmailError,
        passwordError: nextPasswordError,
        fullNameError: nextFullNameError,
        orgNameError: nextOrgNameError,
        orgSlugError: nextOrgSlugError,
      },
    });

    return (
      !nextEmailError &&
      !nextPasswordError &&
      !nextFullNameError &&
      !nextOrgNameError &&
      !nextOrgSlugError
    );
  }, [
    state.email,
    state.fullName,
    state.orgName,
    state.orgSlug,
    state.password,
  ]);

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        "/api/auth/sign-up-with-organization/email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: state.email,
            password: state.password,
            name: state.fullName,
            organizationName: state.orgName,
            organizationSlug: state.orgSlug,
            organizationLogo: state.logoUrl || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readJsonError(response, "Błąd tworzenia organizacji"),
        );
      }

      return (await response.json()) as CreateOrganizationResponse;
    },
    onSuccess: async (data) => {
      if (data.organization?.id) {
        await organization.setActive({
          organizationId: data.organization.id,
        });
      }

      void queryClient.invalidateQueries({ queryKey: ["auth"] });
      dispatch({ type: "reset" });
      toast.success("Organizacja utworzona pomyślnie!");
      onRegisterSuccess();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (validateForm()) {
        createOrgMutation.mutate();
      }
    },
    [createOrgMutation, validateForm],
  );

  return (
    <div className="flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl border-purple-900/50 bg-linear-to-br from-zinc-800/90 to-zinc-700/90 p-8">
        <CreateOrganizationIntro />

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <CreateOrganizationFieldSection
              title="Dane Administratora"
              fields={ADMIN_FIELDS}
              state={state}
              disabled={createOrgMutation.isPending}
              onFieldChange={setField}
            />
            <CreateOrganizationFieldSection
              title="Dane Organizacji"
              fields={ORGANIZATION_FIELDS}
              state={state}
              disabled={createOrgMutation.isPending}
              onFieldChange={setField}
            />
          </div>

          <CreateOrganizationActions
            isPending={createOrgMutation.isPending}
            onBack={onBack}
          />
        </form>
      </Card>
    </div>
  );
}

function CreateOrganizationIntro() {
  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <div className="mb-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
        <Building2 className="size-12 text-purple-400" />
      </div>
      <h2 className="mb-2 text-3xl text-purple-300">Stwórz organizację</h2>
      <p className="text-zinc-400">
        Zarejestruj się i utwórz nową przestrzeń dla swojego zespołu
      </p>
    </div>
  );
}

function CreateOrganizationFieldSection({
  title,
  fields,
  state,
  disabled,
  onFieldChange,
}: {
  title: string;
  fields: CreateOrganizationFieldConfig[];
  state: CreateOrganizationFormState;
  disabled: boolean;
  onFieldChange: (field: CreateOrganizationFormField, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className="border-b border-zinc-700 pb-2 text-lg font-medium text-zinc-200">
        {title}
      </h3>

      {fields.map((fieldConfig) => (
        <CreateOrganizationInputField
          key={fieldConfig.field}
          config={fieldConfig}
          value={state[fieldConfig.field]}
          error={
            fieldConfig.errorField ? state[fieldConfig.errorField] : undefined
          }
          disabled={disabled}
          onValueChange={onFieldChange}
        />
      ))}
    </div>
  );
}

function CreateOrganizationInputField({
  config,
  value,
  error,
  disabled,
  onValueChange,
}: {
  config: CreateOrganizationFieldConfig;
  value: string;
  error?: string;
  disabled: boolean;
  onValueChange: (field: CreateOrganizationFormField, value: string) => void;
}) {
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <Label htmlFor={config.id} className="text-zinc-300">
        {config.label}
      </Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
        <Input
          id={config.id}
          type={config.type}
          placeholder={config.placeholder}
          value={value}
          onChange={(event) =>
            onValueChange(config.field, event.target.value)
          }
          className={FIELD_INPUT_CLASSNAME}
          required={config.required}
          disabled={disabled}
        />
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

function CreateOrganizationActions({
  isPending,
  onBack,
}: {
  isPending: boolean;
  onBack: () => void;
}) {
  return (
    <div className="pt-4">
      <Button
        type="submit"
        className="w-full bg-purple-600 text-white shadow-lg shadow-purple-500/20 hover:bg-purple-700"
        size="lg"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Tworzenie organizacji…
          </>
        ) : (
          "Utwórz organizację"
        )}
      </Button>

      <Button
        type="button"
        onClick={onBack}
        variant="ghost"
        className="mt-4 w-full text-zinc-400 hover:bg-zinc-700/50 hover:text-purple-400"
        size="lg"
        disabled={isPending}
      >
        <ArrowLeft className="mr-2 size-4" />
        Powrót do strony głównej
      </Button>
    </div>
  );
}

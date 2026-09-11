import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getSupabaseClient } from "./rag";

/**
 * Consulta las tablas relacionales de roles y empleados en Supabase.
 * Nota de seguridad: Esta función SOLO tiene acceso a 'empleados' y 'roles'.
 * La tabla 'clientes' NO está expuesta ni es consultable por ninguna vía.
 */
export async function consultarBaseEmpleadosYRoles(filtro?: string): Promise<string> {
  const supabase = getSupabaseClient();
  const f = (filtro || "").trim();

  try {
    // Si no hay filtro específico, devolver resumen general de roles y empleados
    if (!f) {
      const { data: roles, error: errRoles } = await supabase
        .from("roles")
        .select("id, nombre, departamento, salario")
        .order("departamento");

      const { data: empleados, error: errEmpleados } = await supabase
        .from("empleados")
        .select("nombre, email, fecha_ingreso, roles(nombre, departamento, salario)")
        .eq("activo", true);

      if (errRoles || errEmpleados) {
        const msg = errRoles?.message || errEmpleados?.message || "Error al consultar Supabase";
        if (msg.includes("Could not find the table") || msg.includes("schema cache")) {
          return "Las tablas 'roles' y 'empleados' aún no han sido creadas en el SQL Editor de Supabase.";
        }
        return `Error al consultar la base de datos: ${msg}`;
      }

      return JSON.stringify({
        roles_disponibles: roles || [],
        empleados_activos: empleados || [],
      });
    }

    // Buscar en roles (por nombre de cargo o departamento)
    const { data: roles, error: errRoles } = await supabase
      .from("roles")
      .select("id, nombre, departamento, salario, empleados(nombre, email)")
      .or(`nombre.ilike.%${f}%,departamento.ilike.%${f}%`);

    // Buscar en empleados (por nombre o email)
    const { data: empleados, error: errEmpleados } = await supabase
      .from("empleados")
      .select("nombre, email, fecha_ingreso, roles(nombre, departamento, salario)")
      .or(`nombre.ilike.%${f}%,email.ilike.%${f}%`);

    if (errRoles || errEmpleados) {
      const msg = errRoles?.message || errEmpleados?.message || "Error al consultar Supabase";
      if (msg.includes("Could not find the table") || msg.includes("schema cache")) {
        return "Las tablas 'roles' y 'empleados' aún no han sido creadas en el SQL Editor de Supabase.";
      }
      return `Error al consultar la base de datos: ${msg}`;
    }

    return JSON.stringify({
      coincidencias_roles: roles || [],
      coincidencias_empleados: empleados || [],
    });
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : "Error desconocido";
    return `Error inesperado al consultar base de datos: ${errMessage}`;
  }
}

/**
 * Herramienta de LangChain para que Gemini consulte roles, salarios y colaboradores
 */
export const consultarEmpleadosTool = tool(
  async ({ filtro }) => {
    return consultarBaseEmpleadosYRoles(filtro);
  },
  {
    name: "consultar_empleados_y_roles",
    description:
      "Consulta información sobre colaboradores, puestos de trabajo, departamentos y salarios oficiales de la empresa. Úsala cuando pregunten por sueldos, cargos, roles de personas o empleados de la compañía.",
    schema: z.object({
      filtro: z
        .string()
        .optional()
        .describe(
          "Nombre de la persona, título del puesto o nombre del departamento a buscar. Dejar vacío si se pide un listado general de roles o salarios."
        ),
    }),
  }
);

export const appTools = [consultarEmpleadosTool];
